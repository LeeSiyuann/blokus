/* browser-lan-smoke.js — 局域网联机端到端冒烟测试（两个页面同房对局）
 * 用法：node tests/browser-lan-smoke.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output', 'playwright');
const PORT = 18346;
const CDP_PORT = 19223;
const BASE = 'http://127.0.0.1:' + PORT + '/';

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
    this.ws = ws; this.id = 0; this.pending = new Map(); this.onEvent = null;
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

async function targets() {
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
  return (await res.json()).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
}

async function waitTargets(min, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 20000)) {
    try { const list = await targets(); if (list.length >= min) return list; } catch (e) { /* retry */ }
    await sleep(300);
  }
  throw new Error('目标页面数量不足: ' + min);
}

async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
  });
  const cdp = new CDP(ws);
  cdp.onEvent = (msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails || {};
      console.error('  [页面异常] ' + (d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
    }
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  cdp.evalJs = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
    return r.result.value;
  };
  cdp.shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(r.data, 'base64'));
  };
  cdp.clickAt = async (x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  cdp.cellPoint = (row, col) => cdp.evalJs(`(() => {
    const c = document.querySelector('#boardCanvas');
    const r = c.getBoundingClientRect();
    const size = Math.min(r.width, r.height);
    const pad = Math.round(size * 0.045) + 10;
    const cell = (size - pad * 2) / 20;
    return { x: r.left + pad + cell * (${col} + 0.5), y: r.top + pad + cell * (${row} + 0.5) };
  })()`);
  return cdp;
}

async function main() {
  const chrome = CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) { console.error('未找到 Chrome/Edge'); process.exit(2); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blokus-lan-chrome-'));

  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'lan-server.js'), '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
    '--window-size=1500,950', BASE
  ], { stdio: 'ignore' });

  let host = null, guest = null;
  try {
    // 等服务端
    let healthy = false;
    for (let i = 0; i < 40 && !healthy; i++) {
      try { const r = await fetch(BASE + 'api/health'); healthy = (await r.json()).ok === true; } catch (e) { /* retry */ }
      if (!healthy) await sleep(250);
    }
    check(healthy, '局域网服务端已启动');

    const list = await waitTargets(1);
    host = await attach(list[0]);
    for (let i = 0; i < 40; i++) {
      if (await host.evalJs("document.readyState === 'complete' && !!document.querySelector('#btnSingle')")) break;
      await sleep(150);
    }
    check(await host.evalJs("document.querySelector('#btnLan').disabled === false"), 'http 下联机入口可用');

    // 房主创建房间
    await host.evalJs("document.querySelector('#btnLan').click()");
    await host.evalJs("document.querySelector('#lanName').value = 'Host'");
    await host.evalJs("document.querySelector('#lanSeats').value = '2'");
    await host.evalJs("document.querySelector('#btnCreateRoom').click()");
    await sleep(700);
    const roomId = await host.evalJs("document.querySelector('#lobbyCode').textContent");
    check(await host.evalJs("document.body.dataset.view === 'lobby'"), '房主进入联机大厅');
    check(/^[A-Z0-9]{4}$/.test(String(roomId)), '生成 4 位房间码（' + roomId + '）');
    check(await host.evalJs("document.querySelector('#btnLobbyStart').disabled === true"), '单人时不能开始');

    // 访客加入
    await host.send('Target.createTarget', { url: BASE + '?room=' + roomId });
    const list2 = await waitTargets(2);
    const guestTarget = list2.find((t) => t.url.indexOf('room=') >= 0) || list2[list2.length - 1];
    guest = await attach(guestTarget);
    for (let i = 0; i < 40; i++) {
      if (await guest.evalJs("document.readyState === 'complete' && !!document.querySelector('#btnJoinRoom')")) break;
      await sleep(150);
    }
    await guest.evalJs("document.querySelector('#lanName').value = 'Guest'");
    await guest.evalJs("document.querySelector('#btnJoinRoom').click()");
    await sleep(800);
    check(await guest.evalJs("document.body.dataset.view === 'lobby'"), '访客进入联机大厅');
    check((await guest.evalJs("document.querySelectorAll('#lobbyPlayers .player-chip').length")) === 2, '大厅显示 2 个座位');
    await sleep(400);
    check(await host.evalJs("document.querySelector('#btnLobbyStart').disabled === false"), '满员后可开始');
    await host.shot('10-lan-lobby.png');

    // 开始对局
    await host.evalJs("document.querySelector('#btnLobbyStart').click()");
    await sleep(900);
    check(await host.evalJs("document.body.dataset.view === 'game'"), '房主进入对局');
    check(await guest.evalJs("document.body.dataset.view === 'game'"), '访客同步进入对局');
    check((await host.evalJs("document.querySelectorAll('#tray .tray-piece').length")) === 21, '房主看到 21 枚棋子');
    check((await guest.evalJs("document.querySelector('#turnBanner').textContent")).indexOf('Host') >= 0, '访客看到房主的回合');

    const chipText = (cdp, name) => cdp.evalJs(
      "(() => { const c = [...document.querySelectorAll('#playersPanel .player-chip')].find(x => x.textContent.includes(" +
      JSON.stringify(name) + ")); return c ? c.textContent : ''; })()");

    check(await host.evalJs("document.querySelector('#gameMode').textContent==='2 人简化模式'"), '联机双人局标注简化模式');
    // 房主落子 A1
    await host.evalJs("[...document.querySelectorAll('#tray .tray-piece')].find(b => b.dataset.piece === 'I1').click()");
    const p1 = await host.cellPoint(0, 0);
    await host.clickAt(p1.x, p1.y);
    await sleep(900);
    check(String(await chipText(host, 'Host')).indexOf('20 ') >= 0, '房主落子成功（20 剩余）');
    check(String(await chipText(guest, 'Host')).indexOf('20 ') >= 0, '访客实时看到落子');

    // 访客落子：2 人房为蓝/红对角，红方起始角为 T20（row 19, col 19）
    await guest.evalJs("[...document.querySelectorAll('#tray .tray-piece')].find(b => b.dataset.piece === 'I1').click()");
    const p2 = await guest.cellPoint(19, 19);
    await guest.clickAt(p2.x, p2.y);
    await sleep(900);
    check(String(await chipText(guest, 'Guest')).indexOf('20 ') >= 0, '访客落子成功（20 剩余）');
    check(String(await chipText(host, 'Guest')).indexOf('20 ') >= 0, '房主实时看到访客落子');
    check((await guest.evalJs("document.querySelector('#turnBanner').textContent")).indexOf('Host') >= 0, '落子后回合交还房主');

    // 非当前回合不能落子（访客试图连下）
    const before = await guest.evalJs("document.querySelector('#playersPanel').textContent");
    await guest.evalJs("[...document.querySelectorAll('#tray .tray-piece')][0] && [...document.querySelectorAll('#tray .tray-piece')][0].click()");
    const p3 = await guest.cellPoint(1, 0);
    await guest.clickAt(p3.x, p3.y);
    await sleep(500);
    check((await guest.evalJs("document.querySelector('#playersPanel').textContent")) === before, '非当前回合无法落子');
    await guest.shot('11-lan-game.png');

    const failed = results.filter((r) => !r.ok);
    console.log('\n----------------------------------------');
    console.log('局域网端到端：通过 ' + (results.length - failed.length) + ' / ' + results.length);
    if (failed.length) {
      console.log('失败项：' + failed.map((f) => f.name).join('; '));
      process.exitCode = 1;
    } else {
      console.log('全部通过 ✅');
    }
  } catch (e) {
    console.error('局域网测试异常：' + e.message);
    process.exitCode = 1;
  } finally {
    if (host) host.close();
    if (guest) guest.close();
    try { child.kill(); } catch (e) { /* ignore */ }
    try { server.kill(); } catch (e) { /* ignore */ }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

main();

