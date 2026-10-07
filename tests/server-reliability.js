'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {createServer, rooms} = require('../server/lan-server');
const game = require('../js/game');
let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
}
async function main() {
  const file = path.join(__dirname, '../output/lan-tests/rooms.json');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) fs.unlinkSync(file);
  let server = createServer({storePath: file, shareHosts: ['192.168.1.10']});
  const listen = async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return 'http://127.0.0.1:' + server.address().port;
  };
  let base = await listen();
  const post = async (p, b) => {
    const res = await fetch(
        base + p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)});
    return {status: res.status, ...await res.json()};
  };
  const get = async (p) => {
    const res = await fetch(base + p);
    return {status: res.status, ...await res.json()};
  };
  try {
    const h = await post('/api/rooms', {seatCount: 2, name: 'Host'}), route = '/api/rooms/' + h.roomId;
    const j = await post(route + '/join', {name: 'Guest'});
    await post(route + '/start', {token: h.token});
    const resumed = await post(route + '/join', {token: j.token});
    check(resumed.ok && resumed.playerId === 'red', 'token 重连恢复正确颜色与座位');
    check((await get(route + '/record')).status === 403, '棋谱必须鉴权');
    check((await get(route + '/stream')).status === 403, 'SSE 必须鉴权');
    check((await get('/.git/config')).status === 403, '禁止托管 Git 元数据');
    const initial = (await get(route + '/record?token=' + h.token)).record.game;
    check(
        (await post(route + '/move', {token: h.token, piece: 'I1', anchor: [0.5, 0]})).error === 'bad_action',
        '服务端拒绝小数坐标');
    await post(
        route + '/move', {token: h.token, piece: 'I1', anchor: [0, 0], gameId: initial.id, expectedMoves: 0});
    check(
        (await post(
             route + '/move',
             {token: j.token, piece: 'I1', anchor: [19, 19], gameId: initial.id, expectedMoves: 0}))
                .error === 'stale_state',
        '旧局面动作被拒绝');
    check(
        (await get(route + '/record?token=' + h.token)).record.game.moves.length === 1, '拒绝动作未改变棋谱');
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    rooms.clear();
    server = createServer({storePath: file, shareHosts: ['192.168.1.10']});
    base = await listen();
    check((await post(route + '/join', {token: h.token})).ok, '服务重启后保留座位凭据');
    check(
        (await get(route + '/record?token=' + h.token)).record.game.moves.length === 1,
        '服务重启后保留对局进度');
    const room = rooms.get(h.roomId);
    while (room.state.status === 'playing') game.applyAction(room.state, {type: 'resign'});
    room.phase = 'finished';
    check((await post(route + '/restart', {token: j.token})).error === 'not_host', '访客不能开启下一局');
    check((await post(route + '/restart', {token: h.token})).ok, '房主可以同房再战');
    const fresh = (await get(route + '/record?token=' + h.token)).record.game;
    check(
        fresh.mode === 'lan' && fresh.moves.length === 0 && fresh.id !== initial.id,
        '再战保留联机模式并创建新局');
    const l = await post('/api/rooms', {seatCount: 3, name: 'LobbyHost'}), lr = '/api/rooms/' + l.roomId;
    const a = await post(lr + '/join', {name: 'A'}), b = await post(lr + '/join', {name: 'B'});
    check((await post(lr + '/kick', {token: a.token, seat: 2})).error === 'not_host', '非房主不能踢人');
    check((await post(lr + '/kick', {token: l.token, seat: 1})).ok, '房主可释放大厅座位');
    check((await post(lr + '/join', {token: a.token})).error === 'bad_token', '被踢者旧凭据失效');
    check((await post(lr + '/leave', {token: l.token})).ok, '房主退出成功');
    const transferred = await post(lr + '/join', {token: b.token});
    check(transferred.seat === 0 && transferred.hostSlot === 0, '退出后房主转移并重排大厅座位');
    const c = await post(lr + '/join', {name: 'C'});
    await post(lr + '/start', {token: b.token});
    await post(lr + '/leave', {token: c.token});
    await post(lr + '/move', {token: b.token, piece: 'I1', anchor: [0, 0]});
    const left = (await get(lr + '/record?token=' + b.token)).record.game;
    check(
        left.moves[1].type === 'resign' && left.moves[1].player === 1,
        '离席者轮到时记为弃权，不阻塞下一回合');
    check(game.fromJSON(left).moves.length === 2, '联机离席记录可完整重建');
    const solo = rooms.get(l.roomId);
    while (solo.state.status === 'playing') game.applyAction(solo.state, {type: 'resign'});
    solo.phase = 'finished';
    check((await post(lr + '/restart', {token: b.token})).ok, '不足两人时再战回大厅');
    check(rooms.get(l.roomId).phase === 'lobby', '空缺席位可重新邀请');
    check((await post(lr + '/join', {name: 'New guest'})).ok, '结束后离席空位可被新玩家加入');
    console.log('服务端可靠性：通过 ' + checks + ' 项');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    rooms.clear();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
