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
    const failSave = async (fn) => {
      const rename = fs.renameSync;
      fs.renameSync = (a,b) => { if(b===file) throw Error('injected disk failure'); return rename(a,b); };
      try { return await fn(); } finally { fs.renameSync=rename; }
    };
    const renameInitially = fs.renameSync;
    let busyAttempts = 0;
    fs.renameSync = (a,b) => {
      if (b===file && busyAttempts++<2) throw Object.assign(Error('busy'), {code:'EPERM'});
      return renameInitially(a,b);
    };
    let temporaryRoom;
    try { temporaryRoom = await post('/api/rooms', {seatCount:2,name:'Temporary busy'}); }
    finally { fs.renameSync = renameInitially; }
    check(temporaryRoom.ok && busyAttempts===3, '短暂文件占用重试后持久化成功');
    await post('/api/rooms/'+temporaryRoom.roomId+'/leave', {token:temporaryRoom.token});
    let permanentAttempts = 0;
    fs.renameSync = (a,b) => {
      if (b===file) { permanentAttempts++; throw Object.assign(Error('busy'), {code:'EPERM'}); }
      return renameInitially(a,b);
    };
    let permanentResult;
    try { permanentResult = await post('/api/rooms', {seatCount:2,name:'Permanent busy'}); }
    finally { fs.renameSync = renameInitially; }
    check(permanentResult.error==='storage_failed' && permanentAttempts===5 && rooms.size===0, '持续文件占用有限重试并回滚，不无限等待');
    check((await failSave(()=>post('/api/rooms',{seatCount:2,name:'Failed'}))).error==='storage_failed' && rooms.size===0, '建房落盘失败不遗留无身份房间');
    const h = await post('/api/rooms', {seatCount: 2, name: 'Host'}), route = '/api/rooms/' + h.roomId;
    const diskBefore = fs.readFileSync(file,'utf8');
    check((await failSave(()=>post(route+'/join',{name:'FailJoin'}))).status===503 && rooms.get(h.roomId).slots.length===1, '加入写盘失败回滚座位');
    check(fs.readFileSync(file,'utf8')===diskBefore, '原快照未被失败写入覆盖');
    const j = await post(route + '/join', {name: 'Guest'});
    check((await failSave(()=>post(route+'/start',{token:h.token}))).error==='storage_failed' && rooms.get(h.roomId).phase==='lobby', '开局失败保持大厅');
    await post(route + '/start', {token: h.token});
    const resumed = await post(route + '/join', {token: j.token});
    check(resumed.ok && resumed.playerId === 'red', 'token 重连恢复正确颜色与座位');
    check((await get(route + '/record')).status === 403, '棋谱必须鉴权');
    check((await get(route + '/stream')).status === 403, 'SSE 必须鉴权');
    check((await get('/.git/config')).status === 403, '禁止托管 Git 元数据');
    const initial = (await get(route + '/record?token=' + h.token)).record.game;
    check((await failSave(()=>post(route+'/move',{token:h.token,piece:'I1',anchor:[0,0]}))).error==='storage_failed' && rooms.get(h.roomId).state.moves.length===0, '落子写盘失败回滚棋盘与轮次');
    const events=[];
    const mock={token:j.token,res:{write:data=>events.push(data),end:()=>events.push('closed')}};
    rooms.get(h.roomId).clients.add(mock);
    check((await failSave(()=>post(route+'/kick',{token:h.token,seat:1}))).error==='storage_failed' && !rooms.get(h.roomId).slots[1].left && events.length===0, '踢人写盘失败不关闭连接或广播');
    rooms.get(h.roomId).clients.delete(mock);
    check((await failSave(()=>post(route+'/leave',{token:j.token}))).error==='storage_failed' && !rooms.get(h.roomId).slots[1].left, '离席写盘失败仍可重连');
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
    check((await failSave(()=>post(route+'/restart',{token:h.token}))).error==='storage_failed' && room.phase==='finished', '再战写盘失败保留终局');
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
    check(c.ok, '转移房主后可补充玩家');
    const startAfterTransfer = await post(lr + '/start', {token: b.token});
    assert.ok(startAfterTransfer.ok, '转移后开局失败：' + startAfterTransfer.error);
    check((await post(lr + '/leave', {token: c.token})).ok, '开局后访客可离席');
    const moveAfterLeave = await post(lr + '/move', {token: b.token, piece: 'I1', anchor: [0, 0]});
    check(moveAfterLeave.ok, '访客离席后房主可落子：' + moveAfterLeave.error);
    const leftResponse = await get(lr + '/record?token=' + b.token);
    assert.ok(leftResponse.ok, '离席流程读取棋谱失败：' + leftResponse.status + '/' + leftResponse.error);
    const left = leftResponse.record.game;
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
    const createdMany = await Promise.all(Array.from({length:8},(_,i)=>post('/api/rooms',{seatCount:2,name:'Parallel'+i})));
    assert.ok(createdMany.every(r=>r.ok), '并发建房失败：'+createdMany.filter(r=>!r.ok).map(r=>r.status+'/'+r.error).join(','));
    await Promise.all(createdMany.map(async r=>{
      const p='/api/rooms/'+r.roomId;
      const joined = await post(p+'/join',{name:'Guest'});
      assert.ok(joined.ok, '并发加入失败：'+joined.status+'/'+joined.error);
      const started = await post(p+'/start',{token:r.token});
      assert.ok(started.ok, '并发开局失败：'+started.status+'/'+started.error);
      const id=rooms.get(r.roomId).state.id;
      await Promise.all([0,1].map(()=>post(p+'/move',{token:r.token,gameId:id,expectedMoves:0,piece:'I1',anchor:[0,0]})));
    }));
    check(createdMany.every(r=>rooms.get(r.roomId).state.moves.length===1), '多房间并发重复动作只应用一次');
    check(createdMany.every(r=>rooms.get(r.roomId).slots.length===2), '并发房间身份隔离');
    const raw=JSON.parse(fs.readFileSync(file,'utf8'));
    const legacy = {...raw[0],id:'OLD1',state:game.toJSON(game.createGame({mode:'lan',seatCount:raw[0].slots.length,rulesVersion:1}))};
    raw.splice(1,0,{id:'BAD1',slots:null},legacy); fs.writeFileSync(file,JSON.stringify(raw));
    server.closeAllConnections(); await new Promise(r=>server.close(r)); rooms.clear();
    server=createServer({storePath:file}); base=await listen();
    check(createdMany.every(r=>rooms.has(r.roomId)) && !rooms.has('BAD1'), '单个坏房间不阻断后续健康房间恢复');
    check(!rooms.has('OLD1'), '旧规则房间保留在备份并隔离，不继续非标准联机局');
    check(fs.existsSync(file+'.invalid.tmp'), '坏快照原文保留在私有备份');
    server.closeAllConnections(); await new Promise(r=>server.close(r)); rooms.clear();
    const malformed = '{"rooms":';
    fs.writeFileSync(file, malformed);
    let corruptRejected = false;
    try { createServer({storePath:file}); } catch(e) { corruptRejected = e.message==='storage_corrupt'; }
    check(corruptRejected, '整个 JSON 损坏时拒绝启动，不静默创建空服务');
    check(fs.readFileSync(file,'utf8')===malformed && fs.readFileSync(file+'.invalid.tmp','utf8')===malformed, '损坏整文件及原文备份均保留');
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
