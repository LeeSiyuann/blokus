#!/usr/bin/env node
/* lan-server.js — 零依赖局域网服务：静态托管 + 房间 + 裁判 + SSE
 * 用法：node server/lan-server.js [--port 8765] [--host 0.0.0.0] [--advertise IP] [--selftest]
 * 自动发现地址/打开浏览器：node scripts/start-lan.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const game = require(path.join(ROOT, 'js', 'game.js'));
const notation = require(path.join(ROOT, 'js', 'notation.js'));
const {RoomStore, snapshot} = require('./room-store.js');

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
  const out = {port: 8765, host: '0.0.0.0', open: false, selftest: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port')
      out.port = parseInt(argv[++i], 10) || out.port;
    else if (a === '--host')
      out.host = argv[++i] || out.host;
    else if (a === '--open')
      out.open = true;
    else if (a === '--selftest')
      out.selftest = true;
  }
  return out;
}

function newCode(len) {
  let s = '';
  for (let i = 0; i < (len || 4); i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return s;
}
function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

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
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

function cleanRooms() {
  const now = Date.now();
  const expired = [...rooms.values()].filter(r => now - r.lastActivity > ROOM_TTL);
  if (!expired.length) return;
  try {
    transact(null, () => expired.forEach(r => rooms.delete(r.id)));
    for (const room of expired)
      for (const slot of room.slots) rejectClient(room, slot.token, 'expired');
  } catch (_) {
    console.error('房间清理未保存，已保留内存状态，等待重试。');
  }
}
setInterval(cleanRooms, 10 * 60 * 1000).unref();

function lobbyPayload(room) {
  return {
    phase: room.phase,
    roomId: room.id,
    hostSlot: room.hostSlot,
    totalSeats: room.seatCount,
    seats: room.slots.map((s, i) => ({slot: i, name: s.name})),
    state: room.state ? game.toJSON(room.state) : null
  };
}

function broadcast(room, type, payload) {
  const data = 'event: ' + type + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  for (const client of room.clients) {
    try {
      client.res.write(data);
    } catch (e) { /* ignore */
    }
  }
}

function pushState(room) {
  broadcast(room, 'state', lobbyPayload(room));
}

function seatIndexByToken(room, token) {
  if (!token) return -1;
  for (let i = 0; i < room.slots.length; i++)
    if (room.slots[i].token === token) return i;
  return -1;
}

/* ---------------- 静态资源 ---------------- */

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, rel);
  if (!filePath.startsWith(ROOT + path.sep) || rel.split(/[\\/]/).some((p) => p.startsWith('.')) ||
      !(['index.html', 'styles.css'].includes(rel) || /^js[\\/][a-z0-9-]+\.js$/.test(rel))) {
    json(res, 403, {ok: false, error: 'forbidden'});
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      json(res, 404, {ok: false, error: 'not_found'});
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(
        200, {'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- API ---------------- */

/* 房间持久化只在 CLI 启动时启用；测试可使用无磁盘 createServer。 */
let roomStore = new RoomStore(null);
let shareHosts = [];
function saveRooms() {
  roomStore.save(rooms);
}
function restoreRooms() {
  for (const r of roomStore.load(ROOM_TTL)) rooms.set(r.id, r);
}
// 修改、落盘同步完成后才允许响应/广播；失败保持房间对象和 SSE 连接身份。
function transact(room, change) {
  const before = new Map(rooms);
  const saved = room ? snapshot(room) : null;
  try {
    const result = change();
    saveRooms();
    return result;
  } catch (e) {
    rooms.clear();
    for (const [id, r] of before) rooms.set(id, r);
    if (room) {
      Object.assign(room, saved);
      room.state = saved.state ? game.fromJSON(saved.state) : null;
    }
    throw e;
  }
}
function online(room, token) {
  return [...room.clients].some((c) => c.token === token);
}
function roomPayload(room, token, req) {
  const payload = lobbyPayload(room);
  payload.seats =
      room.slots.map((s, i) => ({slot: i, name: s.name, online: online(room, s.token), left: !!s.left}));
  payload.self = seatIndexByToken(room, token);
  const host = req && req.headers.host;
  payload.shareUrls =
      shareHosts.map((h) => 'http://' + h + ':' + (req ? req.socket.localPort : room.port) + '/');
  if (host && !/^(localhost|127\.|\[::1\])/.test(host)) payload.shareUrls.unshift('http://' + host + '/');
  return payload;
}
function notify(room) {
  for (const c of room.clients) {
    try {
      c.res.write('event: state\ndata: ' + JSON.stringify(roomPayload(room, c.token)) + '\n\n');
    } catch (_) {
    }
  }
}
function rejectClient(room, token, reason) {
  for (const c of room.clients)
    if (c.token === token) {
      c.res.write('event: removed\ndata: ' + JSON.stringify({reason}) + '\n\n');
      c.res.end();
      room.clients.delete(c);
    }
}
function settleDepartures(room) {
  while (room.state && room.state.status === 'playing' && room.slots[room.state.turn].left)
    game.applyAction(room.state, {type: 'resign'});
  if (room.state && room.state.status === 'finished') room.phase = 'finished';
}
function depart(room, seat, reason) {
  const slot = room.slots[seat];
  transact(room, () => {
    if (room.phase === 'lobby') {
      room.slots.splice(seat, 1);
      if (seat < room.hostSlot)
        room.hostSlot--;
      else if (seat === room.hostSlot)
        room.hostSlot = 0;
    } else {
      slot.left = true;
      settleDepartures(room);
      if (seat === room.hostSlot) room.hostSlot = room.slots.findIndex((s) => !s.left);
    }
    if (!room.slots.some((s) => !s.left)) rooms.delete(room.id);
  });
  rejectClient(room, slot.token, reason);
  notify(room);
}
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean), method = req.method.toUpperCase();
  if (parts[1] === 'health') {
    json(res, 200, {ok: true, rooms: rooms.size});
    return true;
  }
  if (parts[1] !== 'rooms') return false;
  if (parts.length === 2 && method === 'POST') {
    const b = await readBody(req);
    const seatCount = Number(b.seatCount || 4);
    if (![2, 3, 4].includes(seatCount)) {
      json(res, 400, {ok: false, error: 'invalid_seats'});
      return true;
    }
    let id = newCode(4);
    while (rooms.has(id)) id = newCode(4);
    const token = newToken();
    const room = {
      id,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      seatCount,
      hostSlot: 0,
      phase: 'lobby',
      state: null,
      lang: b.lang === 'en' ? 'en' : 'zh',
      slots: [{name: String(b.name || 'Player 1').slice(0, 12), token, left: false}],
      clients: new Set(),
      port: req.socket.localPort
    };
    transact(null, () => rooms.set(id, room));
    json(
        res, 200,
        {ok: true, roomId: id, seat: 0, token, hostSlot: 0, totalSeats: seatCount, playerId: 'blue'});
    return true;
  }
  const room = rooms.get(parts[2]);
  if (!room) {
    json(res, 404, {ok: false, error: 'room_not_found'});
    return true;
  }
  const action = parts[3];
  room.port = req.socket.localPort;
  room.lastActivity = Date.now();
  if (action === 'join' && method === 'POST') {
    const b = await readBody(req);
    let seat = seatIndexByToken(room, b.token);
    if (b.token && (seat < 0 || room.slots[seat].left)) {
      json(res, 403, {ok: false, error: 'bad_token'});
      return true;
    }
    if (rooms.get(room.id) !== room) throw Error('room_not_found');
    if (!b.token) {
      if (room.phase !== 'lobby') {
        json(res, 409, {ok: false, error: 'started'});
        return true;
      }
      if (room.slots.length >= room.seatCount) {
        json(res, 409, {ok: false, error: 'full'});
        return true;
      }
      transact(
          room,
          () => room.slots.push(
              {name: String(b.name || 'Player').slice(0, 12), token: newToken(), left: false}));
      seat = room.slots.length - 1;
    }
    const ids = game.SEATS[room.state ? room.state.seatCount : room.seatCount];
    json(res, 200, {
      ok: true,
      roomId: room.id,
      seat,
      token: room.slots[seat].token,
      playerId: game.PLAYER_META[ids[seat]].id,
      hostSlot: room.hostSlot,
      totalSeats: room.seatCount
    });
    notify(room);
    return true;
  }
  const b = method === 'POST' ? await readBody(req) : {};
  if (rooms.get(room.id) !== room) throw Error('room_not_found');
  const token = b.token || url.searchParams.get('token'), seat = seatIndexByToken(room, token);
  if (seat < 0 || room.slots[seat].left) {
    json(res, 403, {ok: false, error: 'bad_token'});
    return true;
  }
  if (action === 'stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const client = {res, token};
    room.clients.add(client);
    res.write('retry: 3000\n\n');
    res.write('event: state\ndata: ' + JSON.stringify(roomPayload(room, token, req)) + '\n\n');
    notify(room);
    const ping = setInterval(() => {
      room.lastActivity = Date.now();
      try {
        res.write(': ping\n\n');
      } catch (_) {
      }
    }, 20000);
    req.on('close', () => {
      clearInterval(ping);
      room.clients.delete(client);
      notify(room);
    });
    return true;
  }
  if (action === 'record' && method === 'GET') {
    if (!room.state) {
      json(res, 409, {ok: false, error: 'not_started'});
      return true;
    }
    if (url.searchParams.get('format') === 'text') {
      res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end(notation.toText(room.state));
    } else
      json(res, 200, {ok: true, record: notation.toJSONRecord(room.state)});
    return true;
  }
  if (action === 'leave' && method === 'POST') {
    depart(room, seat, 'left');
    json(res, 200, {ok: true});
    return true;
  }
  if (action === 'kick' && method === 'POST') {
    if (seat !== room.hostSlot) {
      json(res, 403, {ok: false, error: 'not_host'});
      return true;
    }
    if (!Number.isInteger(b.seat) || b.seat === seat || !room.slots[b.seat]) {
      json(res, 400, {ok: false, error: 'invalid_seats'});
      return true;
    }
    depart(room, b.seat, 'kicked');
    json(res, 200, {ok: true});
    return true;
  }
  if ((action === 'start' || action === 'restart') && method === 'POST') {
    if (seat !== room.hostSlot) {
      json(res, 403, {ok: false, error: 'not_host'});
      return true;
    }
    if ((action === 'start' && room.phase !== 'lobby') ||
        (action === 'restart' && room.phase !== 'finished')) {
      json(res, 409, {ok: false, error: 'not_playing'});
      return true;
    }
    const hostToken = room.slots[room.hostSlot].token;
    const slots = room.slots.filter((s) => !s.left);
    if (slots.length < 2 && action === 'restart') {
      transact(room, () => {
        room.slots = slots;
        room.hostSlot = 0;
        room.phase = 'lobby';
        room.state = null;
      });
      notify(room);
      json(res, 200, {ok: true});
      return true;
    }
    if (slots.length < 2) {
      json(res, 409, {ok: false, error: 'not_enough'});
      return true;
    }
    transact(room, () => {
      room.slots = slots;
      room.hostSlot = slots.findIndex((s) => s.token === hostToken);
      room.state = game.createGame({
        mode: 'lan',
        seatCount: slots.length,
        players: slots.map((s) => ({name: s.name, controller: 'human'})),
        lang: room.lang
      });
      room.phase = 'playing';
    });
    notify(room);
    json(res, 200, {ok: true});
    return true;
  }
  if ((action === 'move' || action === 'pass') && method === 'POST') {
    if (room.phase !== 'playing') {
      json(res, 409, {ok: false, error: 'not_playing'});
      return true;
    }
    if (b.gameId !== undefined &&
        (b.gameId !== room.state.id || b.expectedMoves !== room.state.moves.length)) {
      json(res, 409, {ok: false, error: 'stale_state'});
      return true;
    }
    if (room.state.turn !== seat) {
      json(res, 409, {ok: false, error: 'not_your_turn'});
      return true;
    }
    const result = transact(room, () => {
      const result = game.applyAction(
          room.state,
          action === 'pass' ?
              {type: 'pass'} :
              {type: 'place', piece: b.piece, anchor: b.anchor, rot: b.rot, mirror: b.mirror});
      if (!result.ok) throw Error(result.code);
      settleDepartures(room);
      return result;
    });
    notify(room);
    json(res, 200, {ok: true, move: result.move});
    return true;
  }
  json(res, 404, {ok: false, error: 'unknown_endpoint'});
  return true;
}

/* ---------------- 服务器 ---------------- */

function createServer(options) {
  roomStore = new RoomStore(options && options.storePath || null);
  shareHosts = options && options.shareHosts || [];
  restoreRooms();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi(req, res, url);
        if (!handled) json(res, 404, {ok: false, error: 'not_found'});
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, {ok: false, error: 'method_not_allowed'});
        return;
      }
      serveStatic(req, res, url.pathname);
    } catch (e) {
      json(res, e.message === 'storage_failed' ? 503 : 400, {ok: false, error: e.message || 'bad_request'});
    }
  });
}

async function selftest(server, port) {
  const base = 'http://127.0.0.1:' + port;
  const post = async (p, body) => {
    const r = await fetch(
        base + p,
        {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {})});
    return {status: r.status, body: await r.json()};
  };
  const failures = [];
  const check = (cond, name) => {
    if (!cond) failures.push(name);
  };

  const health = await fetch(base + '/api/health').then((r) => r.json());
  check(health.ok === true, 'health');

  const created = await post('/api/rooms', {name: 'Host', seatCount: 2});
  check(created.body.ok && created.body.roomId, 'create room');
  const roomId = created.body.roomId;

  const joined = await post('/api/rooms/' + roomId + '/join', {name: 'Guest'});
  check(joined.body.ok && joined.body.seat === 1, 'join room');

  const started = await post('/api/rooms/' + roomId + '/start', {token: created.body.token});
  check(started.body.ok === true, 'start game');

  const badMove = await post(
      '/api/rooms/' + roomId + '/move',
      {token: joined.body.token, piece: 'I1', anchor: [0, 0], rot: 0, mirror: 0});
  check(badMove.body.error === 'not_your_turn', 'turn enforcement');

  const okMove = await post(
      '/api/rooms/' + roomId + '/move',
      {token: created.body.token, piece: 'I1', anchor: [0, 0], rot: 0, mirror: 0});
  check(okMove.body.ok === true, 'legal move accepted');

  const illegalPass = await post('/api/rooms/' + roomId + '/pass', {token: joined.body.token});
  check(illegalPass.body.error === 'has_moves', 'pass only when stuck');

  const badPiece = await post(
      '/api/rooms/' + roomId + '/move',
      {token: joined.body.token, piece: 'I1', anchor: [0, 19], rot: 0, mirror: 0});
  check(badPiece.body.error === 'not_corner', 'first move must cover corner');

  const legalSecond = await post(
      '/api/rooms/' + roomId + '/move',
      {token: joined.body.token, piece: 'I1', anchor: [19, 19], rot: 0, mirror: 0});
  check(legalSecond.body.ok === true, 'second player first move');

  const ownEdge = await post(
      '/api/rooms/' + roomId + '/move',
      {token: created.body.token, piece: 'I2', anchor: [0, 1], rot: 0, mirror: 0});
  check(ownEdge.body.error === 'own_edge', 'same-color edge rejected');
  const ownCorner = await post(
      '/api/rooms/' + roomId + '/move',
      {token: created.body.token, piece: 'I2', anchor: [1, 1], rot: 0, mirror: 0});
  check(ownCorner.body.ok === true, 'same-color corner accepted');
  const record = await fetch(base + '/api/rooms/' + roomId + '/record?token=' + created.body.token)
                     .then((r) => r.json());
  check(record.record.game.rulesVersion === 2, 'LAN uses standard rules v2');
  return failures;
}

function main(options) {
  const args = Object.assign(parseArgs(process.argv.slice(2)), options);
  const advertise = process.argv.indexOf('--advertise');
  const hosts = args.shareHosts || (advertise >= 0 ? [process.argv[advertise + 1]] : []);
  const server = createServer(
      {storePath: args.selftest ? null : path.join(ROOT, 'server', 'rooms.json'), shareHosts: hosts});
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
    for (const ip of hosts) console.log('  局域网 : http://' + ip + ':' + actualPort + '/');
    console.log('  按 Ctrl+C 退出。');
    if (args.onReady) args.onReady(local);
  });
  return server;
}

if (require.main === module) main();
module.exports = {
  createServer,
  rooms,
  main
};
