#!/usr/bin/env node
/* lan-server.js — 零依赖局域网服务：静态托管 + 房间 + 裁判 + SSE
 * 用法：node server/lan-server.js [--port 8765] [--host 0.0.0.0] [--open] [--selftest]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const game = require(path.join(ROOT, 'js', 'game.js'));
const notation = require(path.join(ROOT, 'js', 'notation.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 2 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;

const rooms = new Map();

/* ---------------- 工具 ---------------- */

function parseArgs(argv) {
  const out = { port: 8765, host: '0.0.0.0', open: false, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = parseInt(argv[++i], 10) || out.port;
    else if (a === '--host') out.host = argv[++i] || out.host;
    else if (a === '--open') out.open = true;
    else if (a === '--selftest') out.selftest = true;
  }
  return out;
}

function newCode(len) {
  let s = '';
  for (let i = 0; i < (len || 4); i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return s;
}
function newToken() { return crypto.randomBytes(16).toString('hex'); }

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

function cleanRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL) {
      for (const client of room.clients) { try { client.res.end(); } catch (e) { /* ignore */ } }
      rooms.delete(id);
    }
  }
}
setInterval(cleanRooms, 10 * 60 * 1000).unref();

function lobbyPayload(room) {
  return {
    phase: room.phase,
    roomId: room.id,
    hostSlot: room.hostSlot,
    totalSeats: room.seatCount,
    seats: room.slots.map((s, i) => ({ slot: i, name: s.name })),
    state: room.state ? game.toJSON(room.state) : null
  };
}

function broadcast(room, type, payload) {
  const data = 'event: ' + type + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  for (const client of room.clients) {
    try { client.res.write(data); } catch (e) { /* ignore */ }
  }
}

function pushState(room) { broadcast(room, 'state', lobbyPayload(room)); }

function seatIndexByToken(room, token) {
  if (!token) return -1;
  for (let i = 0; i < room.slots.length; i++) if (room.slots[i].token === token) return i;
  return -1;
}

function localIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

/* ---------------- 静态资源 ---------------- */

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { json(res, 403, { ok: false, error: 'forbidden' }); return; }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { json(res, 404, { ok: false, error: 'not_found' }); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- API ---------------- */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',id,action]
  const method = req.method.toUpperCase();

  if (parts[1] === 'health' && parts.length === 2) {
    json(res, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
    return true;
  }

  if (parts[1] !== 'rooms') return false;

  // POST /api/rooms
  if (parts.length === 2 && method === 'POST') {
    const body = await readBody(req);
    const seatCount = Math.max(2, Math.min(4, parseInt(body.seatCount, 10) || 4));
    let id = newCode(4);
    while (rooms.has(id)) id = newCode(4);
    const token = newToken();
    const room = {
      id, createdAt: Date.now(), lastActivity: Date.now(),
      seatCount, hostSlot: 0, phase: 'lobby', state: null,
      lang: body.lang === 'en' ? 'en' : 'zh',
      slots: [{ name: String(body.name || 'Player 1').slice(0, 12), token }],
      clients: new Set()
    };
    rooms.set(id, room);
    json(res, 200, {
      ok: true, roomId: id, seat: 0, playerId: 'blue', token,
      hostSlot: 0, totalSeats: seatCount
    });
    return true;
  }

  const room = rooms.get(parts[2]);
  if (!room) { json(res, 404, { ok: false, error: 'room_not_found' }); return true; }
  room.lastActivity = Date.now();
  const action = parts[3];

  // POST /api/rooms/:id/join
  if (action === 'join' && method === 'POST') {
    const body = await readBody(req);
    if (body.token) {
      const seat = seatIndexByToken(room, body.token);
      if (seat >= 0) {
        json(res, 200, { ok: true, seat, token: body.token, playerId: game.PLAYER_META[game.SEATS[room.slots.length] ? game.SEATS[room.slots.length][seat] : seat].id, hostSlot: room.hostSlot, totalSeats: room.seatCount });
        return true;
      }
    }
    if (room.phase !== 'lobby') { json(res, 409, { ok: false, error: 'started' }); return true; }
    if (room.slots.length >= room.seatCount) { json(res, 409, { ok: false, error: 'full' }); return true; }
    const token = newToken();
    room.slots.push({ name: String(body.name || ('Player ' + (room.slots.length + 1))).slice(0, 12), token });
    const seat = room.slots.length - 1;
    const ids = game.PLAYER_META.map((m) => m.id);
    json(res, 200, { ok: true, seat, token, playerId: ids[seat], hostSlot: room.hostSlot, totalSeats: room.seatCount });
    pushState(room);
    return true;
  }

  // POST /api/rooms/:id/start
  if (action === 'start' && method === 'POST') {
    const body = await readBody(req);
    const seat = seatIndexByToken(room, body.token);
    if (seat !== room.hostSlot) { json(res, 403, { ok: false, error: 'not_host' }); return true; }
    if (room.slots.length < 2) { json(res, 409, { ok: false, error: 'not_enough' }); return true; }
    if (room.phase !== 'lobby') { json(res, 409, { ok: false, error: 'already_started' }); return true; }
    room.state = game.createGame({
      mode: 'lan',
      seatCount: room.slots.length,
      players: room.slots.map((s) => ({ name: s.name, controller: 'human' })),
      lang: room.lang
    });
    room.phase = 'playing';
    pushState(room);
    json(res, 200, { ok: true });
    return true;
  }

  // GET /api/rooms/:id/stream
  if (action === 'stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const client = { res };
    room.clients.add(client);
    res.write('retry: 3000\n\n');
    res.write('event: state\ndata: ' + JSON.stringify(lobbyPayload(room)) + '\n\n');
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }, 20000);
    req.on('close', () => { clearInterval(ping); room.clients.delete(client); });
    return true;
  }

  // GET /api/rooms/:id/record
  if (action === 'record' && method === 'GET') {
    if (!room.state) { json(res, 409, { ok: false, error: 'not_started' }); return true; }
    const fmt = (url.searchParams.get('format') || 'json').toLowerCase();
    if (fmt === 'text') {
      const text = notation.toText(room.state);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
      return true;
    }
    json(res, 200, { ok: true, record: notation.toJSONRecord(room.state) });
    return true;
  }

  // POST /api/rooms/:id/move | pass
  if ((action === 'move' || action === 'pass') && method === 'POST') {
    const body = await readBody(req);
    const seat = seatIndexByToken(room, body.token);
    if (seat < 0) { json(res, 403, { ok: false, error: 'bad_token' }); return true; }
    if (room.phase !== 'playing') { json(res, 409, { ok: false, error: 'not_playing' }); return true; }
    if (room.state.turn !== seat) { json(res, 409, { ok: false, error: 'not_your_turn' }); return true; }
    const action_ = action === 'pass'
      ? { type: 'pass' }
      : { type: 'place', piece: body.piece, anchor: body.anchor, rot: body.rot, mirror: body.mirror };
    const result = game.applyAction(room.state, action_);
    if (!result.ok) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: result.code }));
      return true;
    }
    if (room.state.status === 'finished') room.phase = 'finished';
    pushState(room);
    json(res, 200, { ok: true, move: result.move });
    return true;
  }

  json(res, 404, { ok: false, error: 'unknown_endpoint' });
  return true;
}

/* ---------------- 服务器 ---------------- */

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi(req, res, url);
        if (!handled) json(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { ok: false, error: 'method_not_allowed' }); return; }
      serveStatic(req, res, url.pathname);
    } catch (e) {
      json(res, 400, { ok: false, error: e.message || 'bad_request' });
    }
  });
}

function openBrowser(url) {
  const { spawn } = require('child_process');
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* ignore */ }
}

async function selftest(server, port) {
  const base = 'http://127.0.0.1:' + port;
  const post = async (p, body) => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return { status: r.status, body: await r.json() };
  };
  const failures = [];
  const check = (cond, name) => { if (!cond) failures.push(name); };

  const health = await fetch(base + '/api/health').then((r) => r.json());
  check(health.ok === true, 'health');

  const created = await post('/api/rooms', { name: 'Host', seatCount: 2 });
  check(created.body.ok && created.body.roomId, 'create room');
  const roomId = created.body.roomId;

  const joined = await post('/api/rooms/' + roomId + '/join', { name: 'Guest' });
  check(joined.body.ok && joined.body.seat === 1, 'join room');

  const started = await post('/api/rooms/' + roomId + '/start', { token: created.body.token });
  check(started.body.ok === true, 'start game');

  const badMove = await post('/api/rooms/' + roomId + '/move', { token: joined.body.token, piece: 'I1', anchor: [0, 0], rot: 0, mirror: 0 });
  check(badMove.body.error === 'not_your_turn', 'turn enforcement');

  const okMove = await post('/api/rooms/' + roomId + '/move', { token: created.body.token, piece: 'I1', anchor: [0, 0], rot: 0, mirror: 0 });
  check(okMove.body.ok === true, 'legal move accepted');

  const illegalPass = await post('/api/rooms/' + roomId + '/pass', { token: joined.body.token });
  check(illegalPass.body.error === 'has_moves', 'pass only when stuck');

  const badPiece = await post('/api/rooms/' + roomId + '/move', { token: joined.body.token, piece: 'I1', anchor: [0, 19], rot: 0, mirror: 0 });
  check(badPiece.body.error === 'not_corner', 'first move must cover corner');

  const legalSecond = await post('/api/rooms/' + roomId + '/move', { token: joined.body.token, piece: 'I1', anchor: [19, 19], rot: 0, mirror: 0 });
  check(legalSecond.body.ok === true, 'second player first move');

  const ownEdge = await post('/api/rooms/' + roomId + '/move', { token: created.body.token, piece: 'I2', anchor: [0, 1], rot: 0, mirror: 0 });
  check(ownEdge.body.error === 'own_edge', 'same-color edge rejected');
  const ownCorner = await post('/api/rooms/' + roomId + '/move', { token: created.body.token, piece: 'I2', anchor: [1, 1], rot: 0, mirror: 0 });
  check(ownCorner.body.ok === true, 'same-color corner accepted');
  const record = await fetch(base + '/api/rooms/' + roomId + '/record').then((r) => r.json());
  check(record.record.game.rulesVersion === 2, 'LAN uses standard rules v2');
  return failures;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = createServer();
  server.listen(args.port, args.host, async () => {
    const actualPort = server.address().port;
    if (args.selftest) {
      const failures = await selftest(server, actualPort);
      if (failures.length) {
        console.error('[selftest] FAILED: ' + failures.join(', '));
        process.exitCode = 1;
      } else {
        console.log('[selftest] OK');
        process.exitCode = 0;
      }
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      server.close();
      return;
    }
    const local = 'http://localhost:' + actualPort + '/';
    console.log('角斗士棋局域网服务已启动 (Blokus LAN server)');
    console.log('  本机   : ' + local);
    for (const ip of localIPs()) console.log('  局域网 : http://' + ip + ':' + actualPort + '/');
    console.log('  按 Ctrl+C 退出。');
    if (args.open) openBrowser(local);
  });
}

if (require.main === module) main();
module.exports = { createServer, rooms };

