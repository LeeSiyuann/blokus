/* run-all.js — 零依赖测试入口：node tests/run-all.js */
'use strict';

const path = require('path');
const req = (p) => require(path.join(__dirname, '..', p));

const pieces = req('js/pieces.js');
const rules = req('js/rules.js');
const game = req('js/game.js');
const notation = req('js/notation.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, name, extra) {
  if (cond) { passed++; return true; }
  failed++;
  failures.push(name + (extra ? ' :: ' + JSON.stringify(extra) : ''));
  return false;
}
function eq(actual, expected, name) {
  return ok(actual === expected, name, { actual, expected });
}
function section(title) { console.log('\n== ' + title); }

/* ---------- 1. 棋子集 ---------- */
section('pieces');
eq(pieces.PIECE_ORDER.length, 21, '21 种棋子');
eq(pieces.TOTAL_SQUARES, 89, '全部棋子共 89 格');
const expectedOrientations = {
  I1: 1, I2: 2, I3: 2, L3: 4, I4: 2, O4: 1, T4: 4, L4: 8, S4: 4,
  F5: 8, I5: 2, L5: 8, N5: 8, P5: 8, T5: 4, U5: 4, V5: 4, W5: 4, X5: 1, Y5: 8, Z5: 4
};
for (const id of pieces.PIECE_ORDER) {
  const piece = pieces.PIECES[id];
  eq(piece.orientations.length, expectedOrientations[id], id + ' 朝向数');
  ok(piece.cells.every(([r, c]) => r >= 0 && c >= 0), id + ' 已归一化');
}
for (const id of pieces.PIECE_ORDER) {
  for (const rot of [0, 90, 180, 270]) {
    for (const m of [0, 1]) {
      const cells = pieces.cellsFor(id, rot, m);
      eq(cells.length, pieces.PIECES[id].size, id + ' R' + rot + 'M' + m + ' 格数不变');
      ok(cells.every(([r, c]) => r >= 0 && c >= 0), id + ' R' + rot + 'M' + m + ' 归一化');
    }
  }
}

/* ---------- 2. 规则 ---------- */
section('rules');
{
  const s = game.createGame({ seatCount: 4 });
  const first = rules.canPlace(s, 0, 'I1', 0, 0, [0, 0]);
  ok(first.ok, '首子可覆盖起始角 A1');
  eq(rules.canPlace(s, 0, 'I1', 0, 0, [5, 5]).code, 'not_corner', '首子未覆盖起始角被拒');
  eq(rules.canPlace(s, 0, 'I1', 0, 0, [-1, 0]).code, 'out_of_bounds', '越界被拒');
  const s0 = game.createGame({ seatCount: 4 });
  s0.remaining[0].splice(s0.remaining[0].indexOf('Z5'), 1);
  eq(rules.canPlace(s0, 0, 'Z5', 0, 0, [0, 0]).code, 'piece_used', '已使用的棋子被拒');

  // 独立构造局面：预期来自官方规则，不依赖合法着法枚举生成。
  const s2 = game.createGame({ seatCount: 4 });
  s2.board[rules.idx(5, 5)] = 0;
  ok(rules.canPlace(s2, 0, 'I1', 0, 0, [6, 6]).ok, '同色仅角接触合法');
  eq(rules.canPlace(s2, 0, 'I1', 0, 0, [5, 6]).code, 'own_edge', '同色边接触非法');
  eq(rules.canPlace(s2, 0, 'I1', 0, 0, [8, 8]).code, 'no_own_corner', '不接触本方角点非法');
  s2.board[rules.idx(6, 7)] = 1;
  ok(rules.canPlace(s2, 0, 'I1', 0, 0, [6, 6]).ok, '异色边接触合法');
  s2.board[rules.idx(7, 7)] = 2;
  ok(rules.canPlace(s2, 0, 'I1', 0, 0, [6, 6]).ok, '异色角接触合法');
  s2.board[rules.idx(7, 6)] = 0;
  eq(rules.canPlace(s2, 0, 'I1', 0, 0, [6, 6]).code, 'own_edge', '同时有本方角与边接触仍非法');
  eq(rules.canPlace(s2, 0, 'I1', 0, 0, [5, 5]).code, 'overlap', '重叠非法');
  const corner = game.createGame(); corner.board[rules.idx(0, 1)] = 1;
  ok(rules.canPlace(corner, 0, 'I1', 0, 0, [0, 0]).ok, '首子允许与异色边接触');
  for (const [seat, anchor] of [[0,[0,0]], [1,[0,19]], [2,[19,19]], [3,[19,0]]]) {
    ok(rules.canPlace(game.createGame(), seat, 'I1', 0, 0, anchor).ok, '四个起始角均合法');
  }
  const pass = game.createGame();
  eq(game.applyAction(pass, {type:'pass'}).code, 'has_moves', '存在合法落点不能 PASS');
  pass.board.fill(1); pass.board[rules.idx(0,0)] = 0;
  ok(game.applyAction(pass, {type:'pass'}).ok, '被封堵后可 PASS');

  // 剩余格数 / 计分
  const s4 = game.createGame({ seatCount: 4 });
  eq(rules.remainingSquares(s4, 0), 89, '初始剩余 89 格');
  eq(rules.scoreFor(s4, 0), -89, '未落子得分为 -89');
  s4.remaining[0] = [];
  s4.moves.push({ n: 1, player: 0, type: 'place', piece: 'I1' });
  eq(rules.scoreFor(s4, 0), 20, '出完且最后一手为 I1 得 +20');
  eq(rules.computeResult(s4).bonus.blue, 20, '结果奖金与单格收尾分数一致');
  s4.moves = [{ n: 1, player: 0, type: 'place', piece: 'I4' }];
  eq(rules.scoreFor(s4, 0), 15, '出完且最后一手非 I1 得 +15');
}

/* ---------- 3. 随机整局模拟 ---------- */
section('full game simulation');
function makeRng(seed) {
  let x = seed >>> 0;
  return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function playRandom(state, rng) {
  let guard = 0;
  while (state.status === 'playing' && guard++ < 500) {
    const p = state.turn;
    let acted = false;
    for (const pieceId of shuffled(state.remaining[p], rng)) {
      const spots = rules.legalPlacements(state, p, pieceId);
      if (spots.length) {
        const spot = spots[Math.floor(rng() * spots.length)];
        const res = game.applyAction(state, {
          type: 'place', piece: pieceId, anchor: spot.anchor, rot: spot.rot, mirror: spot.mirror
        });
        ok(res.ok, '随机落子应用成功', res.code);
        acted = true;
        break;
      }
    }
    if (!acted) {
      const res = game.applyAction(state, { type: 'pass' });
      ok(res.ok, '无子可下时 PASS 成功', res.code);
    }
  }
  return state;
}

const t0 = Date.now();
const sim = game.createGame({ seatCount: 4, players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] });
playRandom(sim, makeRng(20261006));
const simMs = Date.now() - t0;
eq(sim.status, 'finished', '随机对局可正常终局');
ok(sim.moves.length <= 84 + 4, '手数不超过 88（84 手 + 最多 4 PASS）', sim.moves.length);
ok(!!sim.result, '终局产生 result');
eq(Object.keys(sim.result.scores).length, 4, '四名玩家均有得分');
ok(sim.result.ranking.length === 4, '排名包含 4 人');
ok(Object.values(sim.result.scores).every((v) => v >= -89 && v <= 20), '得分范围合理');
ok(simMs < 60000, '模拟耗时在预算内 (' + simMs + 'ms)');

/* ---------- 4. 序列化 / 重建 / 回放 ---------- */
section('serialize / rebuild / replay');
{
  const json = game.toJSON(sim);
  const restored = game.fromJSON(json);
  eq(restored.moves.length, sim.moves.length, 'JSON 还原手数一致');
  eq(restored.status, sim.status, 'JSON 还原状态一致');
  eq(Buffer.compare(Buffer.from(restored.board), Buffer.from(sim.board)), 0, 'JSON 还原棋盘一致');
  eq(JSON.stringify(restored.remaining), JSON.stringify(sim.remaining), 'JSON 还原剩余棋子一致');
  eq(restored.warnings, 0, '还原过程无告警');

  const mid = game.replayTo(sim, 10);
  eq(mid.moves.length, 10, '回放到第 10 步');
  eq(mid.turn, sim.moves[10].player, '回放后轮次正确');

  const undone = game.replayTo(sim, 20);
  const target = game.replayTo(sim, 19);
  ok(undone.moves.length === 20 && target.moves.length === 19, '回放步数可控');
}

/* ---------- 5. 悔棋 ---------- */
section('undo');
{
  const s = game.createGame({ seatCount: 4 });
  const rng = makeRng(7);
  for (let i = 0; i < 6; i++) {
    const p = s.turn;
    let acted = false;
    for (const pieceId of shuffled(s.remaining[p], rng)) {
      const spots = rules.legalPlacements(s, p, pieceId);
      if (spots.length) {
        game.applyAction(s, { type: 'place', piece: pieceId, anchor: spots[0].anchor, rot: spots[0].rot, mirror: spots[0].mirror });
        acted = true; break;
      }
    }
    if (!acted) break;
  }
  const before = game.toJSON(s);
  const r = game.undo(s);
  ok(r.ok, '悔棋成功');
  eq(s.moves.length, before.moves.length - 1, '悔棋后手数 -1');
  const snapshot = game.replayTo(before, before.moves.length - 1);
  eq(JSON.stringify(game.toJSON(s).board), JSON.stringify(game.toJSON(snapshot).board), '悔棋后棋盘与重放一致');
  eq(s.turn, snapshot.turn, '悔棋后轮次与重放一致');
}

/* ---------- 6. 棋谱编解码 ---------- */
section('notation');
{
  const text = notation.toText(sim);
  ok(text.startsWith('BKS1'), '文本棋谱以 BKS1 开头');
  const parsed = notation.parseText(text);
  ok(parsed.ok, '文本棋谱可解析', parsed.error);
  if (parsed.ok) {
    eq(parsed.state.moves.length, sim.moves.length, '解析后手数一致');
    eq(parsed.warnings, 0, '解析后无告警');
    eq(JSON.stringify(game.toJSON(parsed.state).board), JSON.stringify(game.toJSON(sim).board), '解析后棋盘一致');
  }
  const rec = notation.toJSONRecord(sim);
  const fromRec = notation.fromJSONRecord(rec);
  eq(fromRec.moves.length, sim.moves.length, 'JSON 记录还原手数一致');

  const summary = notation.summarize(sim);
  eq(summary.moves, sim.moves.length, '摘要手数正确');
  ok(!!summary.scores, '摘要包含比分');
}

section('rules version compatibility');
{
  const fresh = game.createGame();
  eq(fresh.rulesVersion, 2, '新局默认标准规则 v2');
  eq(game.fromJSON(game.toJSON(fresh)).rulesVersion, 2, 'JSON 保留 v2');
  eq(notation.parseText(notation.toText(fresh)).state.rulesVersion, 2, '文本保留 v2');
  const old = game.createGame({seatCount:2, rulesVersion:1});
  for (const [piece,anchor] of [['I1',[0,0]],['I1',[19,19]],['I2',[0,1]]]) {
    ok(game.applyAction(old,{type:'place',piece,anchor,rot:0,mirror:0}).ok,'旧规则着法可解释');
  }
  const raw = game.toJSON(old); delete raw.rulesVersion;
  const restored = game.fromJSON(raw);
  eq(restored.rulesVersion, 1, '无版本 JSON 判作旧规则');
  eq(restored.moves.length, 3, '旧棋谱边接触着法不丢失');
  eq(restored.warnings, 0, '旧棋谱无静默删步');
  eq(JSON.stringify([...restored.board]),JSON.stringify([...old.board]),'旧棋盘完整还原');
  eq(game.replayTo(raw,3).moves.length,3,'旧棋谱可逐步回放');
  const oldText=notation.toText(old).replace('Rules: 1\n','');
  eq(notation.parseText(oldText).state.rulesVersion,1,'无版本文本判作旧规则');
  eq(notation.parseText(oldText).state.moves.length,3,'旧文本保留着法');
  eq(game.fromJSON(game.toJSON(restored)).rulesVersion,1,'再导出显式保留旧版本');
  eq(notation.parseText(notation.toText(restored)).state.moves.length,3,'旧文本再导出回读一致');
  old.remaining[0]=[];old.moves.push({type:'place',player:0,piece:'I1'});
  eq(rules.scoreFor(old,0),15,'旧版回放保留原计分');
  let rejected=false;try {game.fromJSON({...raw,rulesVersion:99});}catch(e){rejected=true;}
  ok(rejected,'拒绝未知 JSON 规则版本');
  ok(!notation.parseText(notation.toText(fresh).replace('Rules: 2','Rules: 99')).ok,'拒绝未知文本规则版本');
  for (const count of [2,3]) {
    const s=game.createGame({seatCount:count});
    playRandom(s,makeRng(count));
    eq(s.status,'finished',count+' 人简化局可终局');
    const back=notation.parseText(notation.toText(s));
    eq(back.warnings,0,count+' 人简化局文本无告警');
    eq(JSON.stringify(game.toJSON(back.state).board),JSON.stringify(game.toJSON(s).board),count+' 人简化局文本还原棋盘');
  }
}

section('reliability');
require('./reliability.js')(ok,eq);
section('improvements');
require('./improvements.js')(ok,eq);

/* ---------- 结果 ---------- */
console.log('\n----------------------------------------');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('全部测试通过 ✅');

