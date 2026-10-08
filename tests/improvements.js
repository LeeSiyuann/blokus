'use strict';
const game = require('../js/game');
const rules = require('../js/rules');
const brute = require('./placement-reference');
const {Renderer} = require('../js/render');
module.exports = function(ok, eq) {
  for (const version of [1, 2]) {
    const s = game.createGame({seatCount: 3, rulesVersion: version});
    for (let step = 0; step < 24 && s.status === 'playing'; step++) {
      const p = s.turn;
      if (step % 4 === 0) {
        for (const id of s.remaining[p]) {
          eq(JSON.stringify(rules.legalPlacements(s, p, id)), JSON.stringify(brute(s, p, id)),
             '候选枚举与穷举同顺序 v' + version + '/' + step + '/' + id);
        }
      }
      const actions = rules.allLegalActions(s, p);
      ok(game.applyAction(s, actions[(step * 37) % actions.length]).ok, '候选动作能通过裁判');
    }
  }
  const zero = game.createGame({seatCount: 2, startedAt: 0});
  game.applyAction(zero, {type: 'resign'}, {ts: 0});
  game.applyAction(zero, {type: 'resign'}, {ts: 0});
  eq(zero.result.durationMs, 0, '零时间戳终局不误用当前时间');
  eq(rules.allLegalActions(zero, 0).length, 0, '终局无虚假的 PASS 动作');
  const limited = game.createGame(), full = rules.allLegalActions(limited, limited.turn);
  for (const limit of [0, -1, 1.5, NaN]) {
    eq(rules.allLegalActions(limited, limited.turn, limit).length, 0, '无效/零枚举限制不产生虚假 PASS');
  }
  for (const limit of [1, 4]) {
    eq(JSON.stringify(rules.allLegalActions(limited, limited.turn, limit)), JSON.stringify(full.slice(0, limit)), '枚举限量保留合法动作与顺序');
  }
  game.applyAction(limited, {type: 'resign'});
  eq(rules.allLegalActions(limited, 0).length, 0, '已退出玩家没有可提交动作');
  for (const width of [120, 219.4, 390.5]) {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => null,
      getBoundingClientRect: () => ({left: 10, top: 15, width, height: width})
    };
    const renderer = new Renderer(canvas), {cssSize, pad, cell} = renderer.layout();
    for (const i of [0, 19]) {
      const point = renderer.toCell(
          10 + (pad + (i + .5) * cell) * width / cssSize, 15 + (pad + (i + .5) * cell) * width / cssSize);
      eq(JSON.stringify(point), JSON.stringify({r: i, c: i}), '窄屏/小数缩放命中正确 ' + width + '/' + i);
    }
  }
  for (const mutate of [r => r.seatCount = 0, r => r.startedAt = null, r => r.turnStartedAt = null]) {
    const raw = game.toJSON(game.createGame());
    mutate(raw);
    let rejected = false;
    try {
      game.fromJSON(raw);
    } catch (_) {
      rejected = true;
    }
    ok(rejected, '非法人数/空时间不能静默还原');
  }
};
