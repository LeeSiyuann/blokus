/* browser-smoke.js — 零依赖浏览器冒烟测试（Chrome DevTools Protocol）
 * 用法：node tests/browser-smoke.js [--headed]
 * 依赖：本机 Chrome 或 Edge；不需要 npm 包。
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output', 'playwright');
const PORT = 19222;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(cond, name) {
  results.push({ ok: !!cond, name });
  console.log((cond ? '  ok   ' : '  FAIL ') + name);
  return !!cond;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.onEvent = null;
    ws.addEventListener('message', (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg.id && msg.method && this.onEvent) this.onEvent(msg);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      }
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
      }, 15000);
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

async function findPageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
    await sleep(300);
  }
  throw new Error('Chrome 调试端口未就绪');
}

async function main() {
  const headed = process.argv.includes('--headed');
  const chrome = CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.error('未找到 Chrome/Edge，可通过 CHROME_PATH 指定。');
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blokus-chrome-'));
  const pageUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

  const child = spawn(chrome, [
    headed ? '--new-window' : '--headless=new',
    '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1500,950',
    pageUrl
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    const wsUrl = await findPageWs();
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
    });
    cdp = new CDP(ws);
    cdp.onEvent = (msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        check(false,'浏览器无未处理异常：'+d.text);
        console.error('  [页面异常] ' + (d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
      } else if (msg.method === 'Log.entryAdded') {
        console.error('  [页面日志] ' + (msg.params.entry && msg.params.entry.text));
      }
    };
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable').catch(() => {});

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
      return r.result.value;
    };
    const shot = async (name) => {
      await sleep(250); // 等待视图淡入结束，再保存验收截图。
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(r.data, 'base64'));
    };
    const clickAt = async (x, y) => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };

    // 等待应用初始化
    for (let i = 0; i < 40; i++) {
      const ready = await evalJs("document.readyState === 'complete' && !!document.querySelector('#btnSingle')");
      if (ready) break;
      await sleep(150);
    }
    check(await evalJs("document.readyState === 'complete'"), '页面加载完成');
    console.log('  诊断: ' + await evalJs("JSON.stringify({hasBK: !!window.BK, keys: Object.keys(window.BK||{}).length, scripts: [...document.scripts].map(s => s.src.split('/').pop()), hasRenderer: !!(window.BK && window.BK.Renderer)})"));
    check(await evalJs("document.body.dataset.view === 'launcher'"), '启动器视图显示');
    check(await evalJs("BK.Sound.isEnabled() && BK.getSettings().sound"), '新浏览器默认开启音效');
    check(await evalJs("document.querySelector('#btnSingle').disabled === false"), '单机入口可用');
    check(await evalJs("document.querySelector('#btnLan').disabled === true"), 'file:// 下联机入口禁用');
    check(await evalJs("document.querySelector('#fileHint').classList.contains('hidden') === false"), 'file:// 提示可见');
    check((await evalJs("document.querySelectorAll('[data-i18n]').length")) > 10, 'i18n 绑定存在');
    await shot('01-launcher.png');

    // 语言切换
    await evalJs("document.querySelector('#langToggle').click()");
    check(await evalJs("document.querySelector('#btnSingle .card-title').textContent") === 'Local hotseat', '切换到英文生效');
    await evalJs("document.querySelector('#langToggle').click()");
    check(await evalJs("document.querySelector('#btnSingle .card-title').textContent") === '单机热座', '切回中文生效');

    check(await evalJs("document.querySelector('#lanSeats option').textContent.includes('简化模式')"), '联机座位标注简化模式');
    // 进入单机 4 人局
    await evalJs("document.querySelector('#btnSingle').click()");
    await sleep(120);
    check(await evalJs("document.body.dataset.view === 'setup'"), '进入设置视图');
    await evalJs("document.querySelector('#btnSetupStart').click()");
    await sleep(200);
    check(await evalJs("document.body.dataset.view === 'game'"), '进入对局视图');
    check((await evalJs("document.querySelectorAll('#tray .tray-piece').length")) === 21, '托盘显示 21 枚棋子');
    check((await evalJs("document.querySelectorAll('#playersPanel .player-chip').length")) === 4, '显示 4 名玩家');
    check(await evalJs("document.querySelector('#gameMode').textContent.includes('标准模式')"), '四人对局标注标准模式');
    check(await evalJs("(() => { const g=BK.createGame(); g.board[0]=0; return BK.canPlace(g,0,'I2',0,0,[1,1]).ok && BK.canPlace(g,0,'I2',0,0,[0,1]).code==='own_edge'; })()"), '浏览器共享引擎执行角接触规则');
    await evalJs("document.querySelector('[data-piece=\"F5\"]').click();window.__shape=document.querySelector('#selPreview').toDataURL()");
    check(await evalJs("!document.querySelector('#btnRotate').disabled && !document.querySelector('#btnFlip').disabled"), '选子后旋转与翻转按钮立即可用');
    await evalJs("document.querySelector('#btnRotate').click()");
    check(await evalJs("document.querySelector('#selOrient').textContent.includes('90') && document.querySelector('#selPreview').toDataURL()!==window.__shape"), '旋转按钮更新朝向与放大预览');
    await evalJs("document.querySelector('#btnFlip').click()");
    check(await evalJs("document.querySelector('#selOrient').textContent.includes('镜像 1')"), '翻转按钮更新镜像反馈');
    await press('r','KeyR',82); await press('f','KeyF',70);
    check(await evalJs("document.querySelector('#selOrient').textContent.includes('180') && document.querySelector('#selOrient').textContent.includes('镜像 0')"), 'R/F 快捷键与按钮使用同一朝向');
    await shot('16-selected-orientation.png');
    await shot('02-game-start.png');

    // 选中 I1，点击棋盘 A1
    await evalJs("[...document.querySelectorAll('#tray .tray-piece')].find(b => b.dataset.piece === 'I1').click()");
    check((await evalJs("document.querySelectorAll('#tray .tray-piece.selected').length")) === 1, '可选中棋子');
    const pt = await evalJs(`(() => {
      const c = document.querySelector('#boardCanvas');
      const r = c.getBoundingClientRect();
      const size = Math.min(r.width, r.height);
      const pad = Math.round(size * 0.045) + 10;
      const cell = (size - pad * 2) / 20;
      return { x: r.left + pad + cell * 0.5, y: r.top + pad + cell * 0.5 };
    })()`);
    await clickAt(pt.x, pt.y);
    await sleep(200);
    check((await evalJs("document.querySelector('#playersPanel').textContent")).indexOf('20 ') >= 0, '落子后剩余棋子减少');
    check((await evalJs("Object.keys(localStorage).filter(k => k.indexOf('blokus.') === 0).length")) >= 2, '已写入本地存档');
    await shot('03-after-move.png');
    await evalJs("document.querySelector('#btnUndo').click()");
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===0 && !document.querySelector('[data-piece=\"I1\"]').disabled"), '悔棋恢复棋子轮次与零步存档');
    await evalJs("document.querySelector('[data-piece=\"I1\"]').click()");await clickAt(pt.x,pt.y);
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===1"), '悔棋后可以重新合法落子');

    // 非法落子被拒绝（黄方首子放到 A1 附近会被拒）
    await evalJs("[...document.querySelectorAll('#tray .tray-piece')][0].click()");
    const pt2 = await evalJs(`(() => {
      const c = document.querySelector('#boardCanvas');
      const r = c.getBoundingClientRect();
      const size = Math.min(r.width, r.height);
      const pad = Math.round(size * 0.045) + 10;
      const cell = (size - pad * 2) / 20;
      return { x: r.left + pad + cell * 1.5, y: r.top + pad + cell * 0.5 };
    })()`);
    await clickAt(pt2.x, pt2.y);
    await sleep(150);
    check((await evalJs("document.querySelector('#playersPanel').textContent")).indexOf('21 ') >= 0, '非法落子未改变黄方棋子数');

    // 导出
    await evalJs("document.querySelector('#btnExport').click()");
    await sleep(150);
    const exportText = await evalJs("document.querySelector('#exportText').value");
    check(String(exportText).startsWith('BKS1'), '导出文本棋谱为 BKS1');
    check(String(exportText).indexOf('1. B I1 A1') >= 0, '棋谱记录了第一步');
    const downloads = path.join(OUT_DIR, 'downloads');
    fs.mkdirSync(downloads, {recursive:true});
    await cdp.send('Browser.setDownloadBehavior', {behavior:'allow',downloadPath:downloads});
    const exportId = await evalJs("BK.getCurrent()");
    await evalJs("document.querySelector('#btnDownloadExport').click()");
    const textFile = path.join(downloads, exportId+'.bks.txt');
    for(let i=0;i<20 && !fs.existsSync(textFile);i++) await sleep(100);
    check(fs.existsSync(textFile) && fs.readFileSync(textFile,'utf8')===exportText, '实际下载文本棋谱与弹窗内容一致');
    await evalJs("document.querySelector('#exportSeg [data-fmt=\"json\"]').click()");
    const jsonExport = await evalJs("document.querySelector('#exportText').value");
    check(JSON.parse(jsonExport).game.moves.length===1, 'JSON 导出保留当前着法');
    await evalJs("document.querySelector('#btnDownloadExport').click()");
    const jsonFile = path.join(downloads, exportId+'.json');
    for(let i=0;i<20 && !fs.existsSync(jsonFile);i++) await sleep(100);
    check(fs.existsSync(jsonFile) && fs.readFileSync(jsonFile,'utf8')===jsonExport, '实际下载 JSON 与弹窗内容一致');
    await evalJs(`(()=>{
      window.__clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}});
      window.__exec=document.execCommand;
      document.execCommand=function(cmd){window.__copyValue=document.activeElement.value;window.__copyResult=window.__exec.call(document,cmd);return window.__copyResult};
      document.querySelector('#btnCopyExport').focus();
    })()`);
    await press('Enter','Enter',13);await sleep(120);
    check(await evalJs("window.__copyResult && window.__copyValue===document.querySelector('#exportText').value && document.activeElement.id==='btnCopyExport'"), '剪贴板权限拒绝时实际降级复制并恢复焦点');
    await evalJs("document.execCommand=window.__exec;if(window.__clipboardDescriptor)Object.defineProperty(navigator,'clipboard',window.__clipboardDescriptor);else delete navigator.clipboard");
    await shot('04-export.png');
    await evalJs("document.querySelector('#exportModal .modal-close').click()");

    // 退出 → 历史 → 未完成对局可直接继续
    await evalJs("document.querySelector('#btnExitGame').click()");
    await sleep(120);
    await evalJs("document.querySelector('#btnHistory').click()");
    await sleep(150);
    check((await evalJs("document.querySelectorAll('#historyList .history-item').length")) >= 1, '历史列表出现记录');
    await evalJs("document.querySelector('#historyList .history-item .btn').click()");
    await sleep(250);
    check(await evalJs("document.body.dataset.view === 'game'"), '未完成对局可从历史继续');
    await evalJs("document.querySelector('#btnExitGame').click()");
    await sleep(120);

    // 生成一局完整对局（用页面内引擎随机对弈），验证回放器
    const simulation = await evalJs(`(() => {
      const g = BK.createGame({ seatCount: 4, players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] });
      let x = 12345;
      const rng = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
      let guard = 0;
      while (g.status === 'playing' && guard++ < 400) {
        const p = g.turn;
        let acted = false;
        const rem = g.remaining[p].slice().sort(() => rng() - 0.5);
        for (const id of rem) {
          const spots = BK.legalPlacements(g, p, id);
          if (spots.length) {
            const s = spots[Math.floor(rng() * spots.length)];
            BK.applyAction(g, { type: 'place', piece: id, anchor: s.anchor, rot: s.rot, mirror: s.mirror });
            acted = true; break;
          }
        }
        if (!acted) BK.applyAction(g, { type: 'pass' });
      }
      BK.saveRecord(BK.toJSONRecord(g));
      return {moves:g.moves.length, lastType:g.moves.at(-1).type, before:BK.toJSONRecord(BK.replayTo(BK.toJSON(g),g.moves.length-1))};
    })()`);
    const simMoves = simulation.moves;
    check(simMoves > 40, '页面内模拟完整对局（' + simMoves + ' 步）');
    await evalJs("document.querySelector('#btnHistory').click()");
    await sleep(250);
    check((await evalJs("document.querySelectorAll('#historyList .history-item').length")) >= 2, '历史包含已结束对局');
    await evalJs("document.querySelector('#historyList .history-item .btn').click()");
    await sleep(300);
    check(await evalJs("document.body.dataset.view === 'replay'"), '进入回放视图');
    check((await evalJs("parseInt(document.querySelector('#replaySlider').max, 10)")) === simMoves, '回放步数与对局一致');
    await evalJs("document.querySelector('#btnNext').click()");
    await sleep(150);
    check(await evalJs("document.querySelector('#replaySlider').value") === '1', '回放可步进');
    await evalJs("document.querySelector('#btnPrev').click()");
    check(await evalJs("document.querySelector('#replaySlider').value==='0'"), '回放可后退');
    await evalJs("const slider=document.querySelector('#replaySlider');slider.value='5';slider.dispatchEvent(new Event('input'))");
    check(await evalJs("document.querySelector('#replaySlider').value==='5' && document.querySelector('#replayInfo').textContent.includes('5')"), '回放跳转与说明同步');
    await evalJs("document.querySelector('#btnLast').click()");
    check(Number(await evalJs("document.querySelector('#replaySlider').value"))===simMoves, '回放可跳到终局');
    await evalJs("document.querySelector('#btnFirst').click();document.querySelector('#btnPlay').click()");await sleep(1000);
    await evalJs("document.querySelector('#btnPlay').click()");
    check(Number(await evalJs("document.querySelector('#replaySlider').value"))>=1, '回放自动播放可暂停');
    await evalJs("document.querySelector('#btnFirst').click();document.querySelector('#speedSeg [data-speed=\"4\"]').click();document.querySelector('#btnPlay').click()");await sleep(320);
    await evalJs("document.querySelector('#btnPlay').click()");
    check(Number(await evalJs("document.querySelector('#replaySlider').value"))>=1, '4 倍速播放按新速度前进');
    await shot('05-replay.png');

    // 简化模式标签与旧棋谱回放。
    await evalJs("document.querySelector('#btnPlay').click()");
    await evalJs("document.querySelector('#btnReplayBack').click(); document.querySelector('#btnHistoryBack').click(); document.querySelector('#btnSingle').click(); document.querySelector('#seatSeg .seg-btn').click(); document.querySelector('#btnSetupStart').click()");
    await sleep(1000);
    check(await evalJs("document.querySelectorAll('#playersPanel .player-chip').length===2"), '离开自动回放后新局不被覆盖');
    check(await evalJs("document.querySelector('#gameMode').textContent==='2 人简化模式'"), '双人对局简化模式中文标签');
    await evalJs("document.querySelector('#langToggle').click()");
    check(await evalJs("document.querySelector('#gameMode').textContent==='2-player simplified mode'"), '双人对局简化模式英文标签');
    await shot('06-simplified-en.png');
    await evalJs("document.querySelector('#btnExitGame').click(); document.querySelector('#langToggle').click(); document.querySelector('#btnHistory').click()");
    check(await evalJs("document.querySelector('#historyList').textContent.includes('2 人简化模式')"), '历史显示简化模式');
    await evalJs(`(() => {
      const g=BK.createGame({seatCount:2,rulesVersion:1});
      for(const [piece,anchor] of [['I1',[0,0]],['I1',[19,19]],['I2',[0,1]]]) BK.applyAction(g,{type:'place',piece,anchor});
      const rec=BK.toJSONRecord(g); delete rec.game.rulesVersion;
      document.querySelector('#btnHistoryBack').click();document.querySelector('#btnImport').click();
      document.querySelector('#importText').value=JSON.stringify(rec);document.querySelector('#btnDoImport').click();
    })()`);
    check(await evalJs("document.body.dataset.view==='replay' && document.querySelector('#replayMode').textContent.includes('仅供回放')"), '旧棋谱仅供回放并显示警告');
    await evalJs("document.querySelector('#btnLast').click()");
    check(await evalJs("document.querySelector('#replaySlider').value==='3'"), '旧棋谱三步完整保留');
    await evalJs("document.querySelector('#btnFirst').click();document.querySelector('#btnPlay').click()");await sleep(320);
    check(Number(await evalJs("document.querySelector('#replaySlider').value"))>=1 && await evalJs("document.querySelector('#speedSeg .active').dataset.speed==='4'"), '重新打开回放后速度与控件保持一致');
    await evalJs("document.querySelector('#btnPlay').click();document.querySelector('#btnLast').click()");
    await shot('07-legacy-replay.png');
    await evalJs("document.querySelector('#btnReplayBack').click(); document.querySelector('#btnHistoryBack').click(); document.querySelector('#btnContinue').click()");
    check(await evalJs("document.body.dataset.view==='replay'"), '继续旧存档也进入只读回放');

    await evalJs("document.querySelector('#btnReplayBack').click(); document.querySelector('#btnHistoryBack').click(); document.querySelector('#btnSingle').click(); document.querySelector('#nameList input').value='Alice Smith'; document.querySelector('#langToggle').click()");
    check(await evalJs("document.querySelector('#nameList input').value==='Alice Smith'"), '语言切换保留自定义昵称');
    check(await evalJs("document.querySelector('#seatSeg .active').dataset.seats==='2' && document.querySelectorAll('#nameList input').length===2"), '记忆人数与姓名框一致');
    await evalJs("document.querySelector('#btnSetupStart').click()");
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===0"), '新局零步即保存');
    await evalJs("window.__setItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new Error('quota')}; document.querySelector('#btnExitGame').click(); Storage.prototype.setItem=window.__setItem");
    check(await evalJs("document.querySelector('#toast').textContent.includes('Save failed')"), '存储失败显示明确提示');
    await evalJs(`(()=>{
      document.querySelector('#btnHistory').click();window.__historyCount=BK.listGames().length;
      const index=JSON.parse(localStorage.getItem(BK.K.index));index[0].players='broken';localStorage.setItem(BK.K.index,JSON.stringify([null,...index]));document.querySelector('#btnHistory').click();
    })()`);
    check(await evalJs("document.querySelectorAll('#historyList .history-item').length===window.__historyCount"), '损坏历史摘要不导致界面异常或丢失健康记录');
    await evalJs(`(()=>{
      window.__deleteSet=Storage.prototype.setItem;window.__deleteConfirm=window.confirm;window.confirm=()=>true;window.__deleteFailed=false;
      Storage.prototype.setItem=function(k,v){if(k===BK.K.index && !window.__deleteFailed){window.__deleteFailed=true;throw Error('quota')}return window.__deleteSet.call(this,k,v)};
      document.querySelector('#historyList .history-item .ghost').click();Storage.prototype.setItem=window.__deleteSet;window.confirm=window.__deleteConfirm;
    })()`);
    check(await evalJs("BK.listGames().length===window.__historyCount && document.querySelector('#toast').textContent.includes('Save failed')"), '历史删除失败保留记录并报告失败');
    await evalJs("document.querySelector('#btnHistory').click(); window.__confirm=window.confirm;window.confirm=()=>true;document.querySelector('#historyList .history-item .ghost').click();window.confirm=window.__confirm;document.querySelector('#btnTrash').click()");
    check(await evalJs("document.querySelectorAll('#historyList .history-item').length===1"), '删除记录进入回收站');
    await evalJs("document.querySelector('#historyList .history-item .btn').click();document.querySelector('#btnTrash').click()");
    check(await evalJs("BK.listGames(true).every(s=>!s.deletedAt)"), '回收站恢复正文与索引');
    await evalJs("document.querySelector('#btnHistoryBack').click();document.querySelector('#btnImport').click();document.querySelector('#importText').value=JSON.stringify(BK.exportBackup());document.querySelector('#btnDoImport').click()");
    check(await evalJs("document.body.dataset.view==='history' && document.querySelector('#toast').textContent==='Backup restored'"), '全量备份从导入入口恢复');
    await evalJs("document.querySelector('#btnHistoryBack').click();document.querySelector('#btnImport').click();document.querySelector('#importText').value=JSON.stringify(BK.toJSONRecord(BK.createGame({players:[{name:'<img src=x>'},{name:'B'},{name:'C'},{name:'D'}]})));document.querySelector('#btnDoImport').click()");
    check(await evalJs("!document.querySelector('#turnBanner img') && document.querySelector('#turnBanner').textContent.includes('<img src=x>')"), '玩家名按文本显示，不解释 HTML');
    await evalJs("document.querySelector('#btnExitGame').click();window.__count=BK.listGames().length;document.querySelector('#btnImport').click();const bad=BK.toJSONRecord(BK.createGame());bad.game.board[0][0]=0;document.querySelector('#importText').value=JSON.stringify(bad);document.querySelector('#btnDoImport').click()");
    check(await evalJs("BK.listGames().length===window.__count && document.querySelector('#toast').textContent.includes('Snapshot')"), '损坏棋谱拒绝且不新增存档');
    await evalJs("document.querySelector('#importModal .modal-close').click();document.querySelector('#btnHistory').click()");
    await shot('08-history-reliability.png');

    async function press(key,code,virtual) {
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual,text:key==='Enter'?'\r':key===' '?' ':''});
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});
    }
    await evalJs("document.querySelector('#btnHistoryBack').click();document.querySelector('#btnSingle').click();document.querySelector('#seatSeg [data-seats=\"4\"]').click();document.querySelector('#btnSetupStart').click();document.querySelector('[data-piece=\"I1\"]').click();document.querySelector('#boardAccess').focus()");
    check(await evalJs("document.querySelectorAll('#boardAccess [role=gridcell]').length===400"),'读屏棋盘提供全部 400 格');
    await press('ArrowRight','ArrowRight',39);
    check(await evalJs("document.querySelector('#boardAccess').getAttribute('aria-activedescendant')==='boardCanvas-cell-1'"),'键盘方向键移动棋盘焦点');
    await press('ArrowLeft','ArrowLeft',37);await press('Enter','Enter',13);
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===1"),'键盘 Enter 可合法落子');
    const ax = await cdp.send('Accessibility.getFullAXTree');
    check(ax.nodes.some(n=>!n.ignored && n.role?.value==='grid') && ax.nodes.some(n=>!n.ignored && n.role?.value==='gridcell' && n.name?.value?.includes('A1')),'真实浏览器可访问树含棋盘格子');
    await evalJs("document.querySelector('#patternToggle').focus()");await press('Enter','Enter',13);
    check(await evalJs("BK.getSettings().patternMode && document.querySelector('#patternToggle').getAttribute('aria-pressed')==='true'"),'按钮 Enter 启用并保存字母辅助');
    await evalJs("document.querySelector('[data-piece=\"I2\"]').click();document.querySelector('#btnHint').click()");
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===1 && /可落子|Legal/.test(document.querySelector('#boardStatus').textContent)"),'落点提示只预览合法位置');
    await evalJs("document.querySelector('#btnPlace').click()");
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===2"),'提示位置经确认后落子');
    await evalJs("document.querySelector('#btnExport').focus();document.querySelector('#btnExport').click()");
    check(await evalJs("document.querySelector('main').inert && document.activeElement.id==='exportText'"),'弹窗打开移入焦点并隔离背景');
    await evalJs("document.querySelector('#btnDownloadExport').focus()");await press('Tab','Tab',9);
    check(await evalJs("document.querySelector('#exportModal').contains(document.activeElement)"),'Tab 焦点限制在弹窗');
    await press('Escape','Escape',27);
    check(await evalJs("!document.querySelector('main').inert && document.activeElement.id==='btnExport'"),'Escape 关闭弹窗并恢复原焦点');
    await evalJs("document.querySelector('#btnExitGame').click();document.querySelector('#btnSingle').click();document.querySelector('#btnSetupStart').click();document.querySelector('[data-piece=\"I1\"]').click();if(BK.getLang()!=='en')document.querySelector('#langToggle').click()");
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await sleep(200);
    await evalJs("document.querySelector('#boardCanvas').scrollIntoView({block:'center'})");
    const touchPoint = await evalJs(`(()=>{const c=document.querySelector('#boardCanvas'),r=c.getBoundingClientRect(),renderer=new BK.Renderer(c),{cssSize,pad,cell}=renderer.layout();return {x:r.left+(pad+cell/2)*r.width/cssSize,y:r.top+(pad+cell/2)*r.height/cssSize};})()`);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPoint,radiusX:3,radiusY:3,force:1,id:0}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===0 && document.querySelector('#boardStatus').textContent.includes('Legal placement')"),'真实触屏事件先预览，不误落子');
    await evalJs("document.querySelector('#btnPlace').click()");
    check(await evalJs("BK.loadRecord(BK.getCurrent()).game.moves.length===1"),'触屏预览可确认落子');
    check(await evalJs("document.documentElement.scrollWidth<=390 && document.querySelector('#btnPlace').getBoundingClientRect().bottom<=844"),'390px 英文布局不横溢出且确认按钮在屏内');
    await shot('13-mobile-game.png');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:2,mobile:true});await sleep(200);
    check(await evalJs("document.documentElement.scrollWidth<=320 && document.querySelector('#btnPlace').getBoundingClientRect().height>=44"),'320px 窄屏无横溢出并保留触控目标');
    check(await evalJs("(()=>{const t=document.querySelector('#toast'),r=t.getBoundingClientRect(),c=document.querySelector('#view-game .controls').getBoundingClientRect();return t.classList.contains('hidden') || r.bottom<=c.top})()"),'窄屏提示不遮挡底部操作区');
    await shot('14-narrow-game.png');
    await evalJs("document.querySelector('#btnExport').click()");
    check(await evalJs("document.documentElement.scrollWidth<=320 && document.querySelector('#exportModal .modal-card').getBoundingClientRect().width<=320"),'窄屏导出弹窗不溢出');
    check(await evalJs("getComputedStyle(document.querySelector('#toast')).pointerEvents==='none' && document.body.classList.contains('dialog-open')"),'弹窗提示不拦截复制与下载操作');
    await shot('15-mobile-export.png');
    await evalJs("document.querySelector('#exportModal .modal-close').click();document.querySelector('#btnExitGame').click();document.querySelector('#btnSingle').click();document.querySelector('#seatSeg [data-seats=\"3\"]').click();document.querySelector('#btnSetupStart').click()");
    check(await evalJs("document.querySelectorAll('#playersPanel .player-chip').length===3 && document.querySelector('#gameMode').textContent.includes('3-player simplified')"), '三人热座界面与简化标签正确');
    await evalJs("if(BK.Sound.isEnabled())document.querySelector('#soundToggle').click()");
    check(await evalJs("!BK.Sound.isEnabled() && !BK.getSettings().sound"), '音效可关闭并保存');
    await cdp.send('Page.reload');await sleep(400);
    check(await evalJs("!BK.Sound.isEnabled() && BK.getLang()==='en' && BK.getSettings().patternMode"), '刷新保留音效语言与字母辅助设置');
    await evalJs("document.querySelector('#btnContinue').click()");
    check(await evalJs("document.body.dataset.view==='game' && document.querySelectorAll('#playersPanel .player-chip').length===3"), '刷新后可继续三人零步对局');
    await evalJs("document.querySelector('#btnExitGame').click();document.querySelector('#btnImport').click()");
    const documentNode = await cdp.send('DOM.getDocument');
    const fileInput = await cdp.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#importFile'});
    await cdp.send('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[jsonFile]});await sleep(120);
    check(await evalJs("document.querySelector('#importText').value")===jsonExport, '实际选择 JSON 文件后正确读取内容');
    await evalJs("document.querySelector('#btnDoImport').click()");
    check(await evalJs("document.body.dataset.view==='game' && BK.loadRecord(BK.getCurrent()).game.moves.length===1"), '文件导入后还原对局与继续入口');
    await evalJs("document.querySelector('#btnExitGame').click();document.querySelector('#btnImport').click()");
    check(await evalJs("document.querySelector('#importFile').value===''"), '再次导入清空文件选择，可重选同一个文件');
    await evalJs("document.querySelector('#importText').value="+JSON.stringify(JSON.stringify(simulation.before))+";document.querySelector('#btnDoImport').click()");
    check(simulation.lastType==='pass' && await evalJs("!document.querySelector('#btnPass').disabled"), '无合法落子时实际 PASS 按钮启用');
    await evalJs("document.querySelector('#btnPass').click()");
    check(await evalJs("BK.loadRecord("+JSON.stringify(simulation.before.game.id)+").game.status==='finished' && !document.querySelector('#overModal').classList.contains('hidden') && BK.getCurrent()===null && document.querySelector('#overBody').textContent.length>0"), 'PASS 正确终局、显示计分并清除继续指针');
    await evalJs("document.querySelector('#btnOverExport').click()");
    check(await evalJs("!document.querySelector('#exportModal').classList.contains('hidden') && document.activeElement.id==='exportText' && BK.parseText(document.querySelector('#exportText').value).state.status==='finished'"), '终局弹窗可导出完整棋谱');

    // 结果
    const failed = results.filter((r) => !r.ok);
    console.log('\n----------------------------------------');
    console.log('浏览器冒烟测试：通过 ' + (results.length - failed.length) + ' / ' + results.length);
    if (failed.length) {
      console.log('失败项：' + failed.map((f) => f.name).join('; '));
      process.exitCode = 1;
    } else {
      console.log('全部通过 ✅  截图目录：output/playwright/');
    }
  } catch (e) {
    console.error('浏览器测试异常：' + e.message);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    try { child.kill(); } catch (e) { /* ignore */ }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

main();

