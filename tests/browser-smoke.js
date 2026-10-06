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

    // 进入单机 4 人局
    await evalJs("document.querySelector('#btnSingle').click()");
    await sleep(120);
    check(await evalJs("document.body.dataset.view === 'setup'"), '进入设置视图');
    await evalJs("document.querySelector('#btnSetupStart').click()");
    await sleep(200);
    check(await evalJs("document.body.dataset.view === 'game'"), '进入对局视图');
    check((await evalJs("document.querySelectorAll('#tray .tray-piece').length")) === 21, '托盘显示 21 枚棋子');
    check((await evalJs("document.querySelectorAll('#playersPanel .player-chip').length")) === 4, '显示 4 名玩家');
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
    await shot('04-export.png');
    await evalJs("document.querySelector('#exportModal').classList.add('hidden')");

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
    const simMoves = await evalJs(`(() => {
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
      return g.moves.length;
    })()`);
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
    await shot('05-replay.png');

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

