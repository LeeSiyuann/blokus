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
  eq(s.rulesVersion, 2, '新对局默认使用官方规则 v2');
  eq(rules.canPlace(s, 0, 'I1', 0, 0, [5, 5]).code, 'not_corner', '首子未覆盖起始角被拒');
  eq(rules.canPlace(s, 0, 'I1', 0, 0, [-1, 0]).code, 'out_of_bounds', '越界被拒');
  const s0 = game.createGame({ seatCount: 4 });
  s0.remaining[0].splice(s0.remaining[0].indexOf('Z5'), 1);
  eq(rules.canPlace(s0, 0, 'Z5', 0, 0, [0, 0]).code, 'piece_used', '已使用的棋子被拒');

  ok(rules.hasAnyMove(s, 0), '首子阶段存在合法着法');

  // ---- 官方 v2 邻接矩阵：蓝=0（对手），黄=1（本方）----
  const m = game.createGame({ seatCount: 4 });
  m.board[rules.idx(10, 10)] = 0;   // 蓝（对手）
  m.board[rules.idx(12, 12)] = 1;   // 黄（本方）
  ok(rules.canPlace(m, 1, 'I1', 0, 0, [13, 13]).ok, '同色角接触 → 合法');
  eq(rules.canPlace(m, 1, 'I1', 0, 0, [12, 13]).code, 'same_color_edge', '同色边接触 → 非法');
  eq(rules.canPlace(m, 1, 'I1', 0, 0, [15, 15]).code, 'no_own_corner', '无同色角接触 → 非法');
  m.board[rules.idx(12, 14)] = 0;   // 蓝：与候选 (13,13) 对角
  eq(rules.canPlace(m, 1, 'I1', 0, 0, [13, 13]).code, 'opposite_corner', '与对手角接触 → 非法');
  m.board[rules.idx(12, 14)] = rules.EMPTY;
  m.board[rules.idx(13, 12)] = 0;   // 蓝：与候选 (13,13) 共边
  ok(rules.canPlace(m, 1, 'I1', 0, 0, [13, 13]).ok, '与对手边接触 → 合法（同色角接触仍满足）');
  eq(rules.canPlace(m, 1, 'I1', 0, 0, [10, 10]).code, 'overlap', '重叠被拒');
  ok(rules.canPlace(m, 1, 'I1', 0, 0, [19, 19]).ok === false, '对角 (19,19) 无接触时被拒');

  // ---- v1 兼容（仅用于回放历史对局）----
  const m1 = game.createGame({ seatCount: 4, rulesVersion: 1 });
  eq(m1.rulesVersion, 1, '可创建 v1 规则对局');
  ok(rules.canPlaceV1(m1, 0, 'I1', 0, 0, [0, 0]).ok, 'v1 首子覆盖起始角');
  m1.board[rules.idx(5, 5)] = 0;    // 蓝
  m1.board[rules.idx(9, 9)] = 1;    // 黄（远离）
  ok(rules.canPlace(m1, 0, 'I1', 0, 0, [5, 6]).ok, 'v1 同色边相邻 → 合法');
  eq(rules.canPlace(m1, 0, 'I1', 0, 0, [2, 2]).code, 'no_own_edge', 'v1 无同色边相邻 → 非法');
  m1.board[rules.idx(5, 3)] = 1;    // 黄：与候选 (5,4) 共边
  eq(rules.canPlace(m1, 0, 'I1', 0, 0, [5, 4]).code, 'touch_opponent', 'v1 与对手边相邻 → 非法');

  // 剩余格数 / 计分
  const s4 = game.createGame({ seatCount: 4 });
  eq(rules.remainingSquares(s4, 0), 89, '初始剩余 89 格');
  eq(rules.scoreFor(s4, 0), -89, '未落子得分为 -89');
  s4.remaining[0] = [];
  s4.moves.push({ n: 1, player: 0, type: 'place', piece: 'I1' });
  eq(rules.scoreFor(s4, 0), 15, '出完且最后一手为 I1 得 +15');
  s4.moves = [{ n: 1, player: 0, type: 'place', piece: 'I4' }];
  eq(rules.scoreFor(s4, 0), 20, '出完且最后一手非 I1 得 +20');
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

// v1（旧规则）对局仍需可完整跑完，保证历史对局回放能力
const simV1 = game.createGame({
  seatCount: 4, rulesVersion: 1,
  players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]
});
playRandom(simV1, makeRng(777));
eq(simV1.status, 'finished', 'v1 规则随机对局可终局（回放兼容）');
eq(simV1.rulesVersion, 1, 'v1 对局版本保持为 1');

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
  ok(text.indexOf('Rules: v2') >= 0, '文本棋谱包含规则版本 v2');
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
  eq(fromRec.rulesVersion, 2, 'JSON 记录保留 rulesVersion');

  // 旧棋谱（无 Rules 行）按 v1 解析
  const legacyText = text.split('\n').filter((l) => l.trim().indexOf('Rules:') !== 0).join('\n');
  const legacy = notation.parseText(legacyText);
  ok(legacy.ok, '旧格式棋谱仍可解析');
  eq(legacy.state.rulesVersion, 1, '无 Rules 行的旧棋谱按 v1 处理');

  const summary = notation.summarize(sim);
  eq(summary.moves, sim.moves.length, '摘要手数正确');
  ok(!!summary.scores, '摘要包含比分');
}

/* ---------- 结果 ---------- */
console.log('\n----------------------------------------');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('全部测试通过 ✅');

