'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = require('../js/game');
const notation = require('../js/notation');
const rules = require('../js/rules');
const clone = (v) => JSON.parse(JSON.stringify(v));

module.exports = function(ok, eq) {
  const sample = game.createGame(
      {seatCount: 2, startedAt: 1000, players: [{name: 'Alice Smith'}, {name: '李 四 "红"'}]});
  game.applyAction(sample, {type: 'place', piece: 'I1', anchor: [0, 0]}, {ts: 1500});
  game.applyAction(sample, {type: 'place', piece: 'I1', anchor: [19, 19]}, {ts: 2200});
  const original = game.toJSON(sample);
  eq(game.fromJSON(original).moves[1].elapsedMs, 700, 'JSON 恢复保留每步耗时');
  const text = notation.parseText(notation.toText(sample));
  ok(text.ok, '带空格与引号的文本棋谱可读回');
  eq(text.state.players[0].name, 'Alice Smith', '空格昵称不截断');
  eq(text.state.players[1].name, '李 四 "红"', '中文引号昵称不丢失');
  const custom = game.createGame({seatIds: [1, 3], seatCount: 2, players: [{name: 'Y'}, {name: 'G'}]});
  eq(notation.parseText(notation.toText(custom)).state.seatIds.join(','), '1,3', '自定义颜色席位往返一致');
  const reordered = game.createGame({seatIds: [3, 1], seatCount: 2, players: [{name: 'Green first'}, {name: 'Yellow second'}]});
  game.applyAction(reordered, {type: 'place', piece: 'I1', anchor: [19, 0]});
  const reorderedBack = notation.parseText(notation.toText(reordered)).state;
  eq(reorderedBack.players[0].name, 'Green first', '非默认顺序席位保留首位昵称');
  eq(reorderedBack.players[1].name, 'Yellow second', '非默认顺序席位保留次位昵称');
  eq(JSON.stringify([...reorderedBack.board]), JSON.stringify([...reordered.board]), '非默认顺序棋谱保留占格');
  ok(!notation.parseText(notation.toText(sample).replace('Seats: 0,2', 'Seats: 0,1')).ok, '文本颜色与席位矛盾被拒绝');
  ok(!notation.parseText(notation.toText(sample).replace('Mode: hotseat', 'Mode: invalid')).ok, '文本未知模式被拒绝');
  ok(!notation.parseText(notation.toText(sample).replace(/^Date:.*$/m, 'Date: invalid')).ok, '文本非法日期被拒绝');
  ok(!notation.parseText(notation.toText(sample).replace(/^Game:.*$/m, 'Game: ../bad')).ok, '文本非法标识被拒绝');
  let invalidSeats = false;
  try { game.createGame({seatIds: [0]}); } catch (_) { invalidSeats = true; }
  ok(invalidSeats, '创建时不静默替换非法座位配置');
  const malformed = [
    (r) => {
      r.moves[0].player = 1;
    },
    (r) => {
      r.moves[0].n = 2;
    },
    (r) => {
      r.moves[0].anchor = [0.5, 0];
    },
    (r) => {
      r.moves[0].anchor = null;
    },
    (r) => {
      r.moves[0].rot = 45;
    },
    (r) => {
      r.moves[0].mirror = 'false';
    },
    (r) => {
      r.board[2][2] = 0;
    },
    (r) => {
      r.remaining[0] = [];
    },
    (r) => {
      r.seatIds = [0, 0];
    },
    (r) => {
      r.players[0] = null;
    },
    (r) => {
      r.moves[0].ts = -1;
    }
  ];
  for (const [i, damage] of malformed.entries()) {
    const broken = clone(original);
    damage(broken);
    let rejected = false;
    try {
      game.fromJSON(broken);
    } catch (_) {
      rejected = true;
    }
    ok(rejected, '损坏 JSON ' + i + ' 被拒绝');
  }
  ok(!notation.parseText(notation.toText(sample).replace('1. B', '1. R')).ok, '文本轮次错误被拒绝');
  ok(!notation.parseText('BKS1\nPlayers: B=A R=B').ok, '缺少着法段被拒绝');
  const snapshot = JSON.stringify(game.toJSON(sample));
  eq(game.applyAction(sample, {type: 'place', piece: 'I2', anchor: ['1', 1]}).code, 'bad_action',
     '非法动作返回可读错误');
  eq(JSON.stringify(game.toJSON(sample)), snapshot, '非法动作不改变状态');
  game.applyAction(sample, {type: 'resign'}, {ts: 3000});
  game.applyAction(sample, {type: 'resign'}, {ts: 4000});
  eq(sample.status, 'finished', '弃权可重建到终局');
  const back = game.fromJSON(game.toJSON(sample));
  eq(back.result.durationMs, 3000, '终局持续时间保持');
  eq(back.result.winners.length, 2, '同分玩家均列为获胜者');
  eq(notation.parseText(notation.toText(sample)).state.moves.at(-1).type, 'resign', '弃权棋谱往返');
  eq(rules.scoreFor(back, 0), -88, '弃权按剩余格数计分');

  function storage() {
    const data = new Map();
    let failKey = null;
    const localStorage = {
      getItem: k => data.has(k) ? data.get(k) : null,
      removeItem: k => data.delete(k),
      key: i => [...data.keys()][i],
      setItem(k, v) {
        if (failKey === k) {
          failKey = null;
          throw new Error('quota');
        }
        data.set(k, String(v));
      },
      get length() {
        return data.size;
      }
    };
    const context = {
      localStorage,
      module: {exports: {}},
      require: (id) => id === './notation.js' ? notation : require(id)
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8'), context);
    return {
      api: context.module.exports,
      data,
      fail(k) {
        failKey = k;
      }
    };
  }
  const a = storage(), record = notation.toJSONRecord(sample);
  ok(a.api.saveRecord(record).ok, '正常保存成功');
  ok(a.api.deleteGame(sample.id).ok, '删除移入回收站');
  eq(a.api.listGames().length, 0, '已删除记录不在主列表');
  ok(!!a.api.loadRecord(sample.id), '回收站正文保留');
  ok(a.api.restoreGame(sample.id).ok, '回收站恢复成功');
  eq(a.api.listGames().length, 1, '恢复后回主列表');
  a.api.setSettings({lang: 'en', sound: false, lastSeatCount: 2});
  a.api.setConnection({token: 'credential-secret', roomId: 'ABCD'});
  const backup = a.api.exportBackup();
  ok(!JSON.stringify(backup).includes('credential-secret'), '备份不包含网络凭据');
  const b = storage();
  ok(b.api.importBackup(backup).ok, '全量备份可迁移');
  eq(b.api.getSettings().lang, 'en', '备份迁移语言');
  eq(b.api.getSettings().sound, false, '备份迁移音效');
  eq(b.api.listGames().length, 1, '备份迁移历史');
  a.api.setSettings({patternMode:true});
  ok(b.api.importBackup(a.api.exportBackup()).ok && b.api.getSettings().patternMode, '备份迁移字母辅助设置');
  const before = JSON.stringify([...b.data]);
  const bad = clone(backup);
  bad.records[0].record.game.moves[0].anchor = null;
  ok(!b.api.importBackup(bad).ok, '损坏备份被拒绝');
  eq(JSON.stringify([...b.data]), before, '损坏备份不会改写原数据');
  const active = game.createGame({seatCount: 2, id: 'active'});
  b.api.saveRecord(notation.toJSONRecord(active));
  const replacing = b.api.exportBackup();
  replacing.records.find(e=>e.record.game.id==='active').deletedAt = new Date().toISOString();
  replacing.current = 'missing';
  ok(b.api.importBackup(replacing).ok && b.api.getCurrent()===null, '备份覆盖删除活动局时清理无效继续指针');
  const beforeFailure = JSON.stringify([...b.data]);
  b.fail(b.api.K.index);
  const extra = clone(record);
  extra.game.id = 'new-record';
  ok(!b.api.saveRecord(extra).ok, '索引写入失败正确返回失败');
  eq(JSON.stringify([...b.data]), beforeFailure, '保存失败回滚正文和索引');
  const many = storage();
  many.api.saveRecord(notation.toJSONRecord(active));
  for (let i = 0; i < 200; i++) {
    const r = clone(record);
    r.game.id = 'finished-' + i;
    many.api.saveRecord(r);
  }
  eq(many.api.listGames().length, 200, '200 局上限清理索引');
  eq([...many.data.keys()].filter(k => k.startsWith('blokus.game.')).length, 200, '淘汰记录同时删除正文');
  ok(!!many.api.loadRecord('active'), '自动淘汰不删除活动局');

  // 使用确定性时钟检查播放中的速度切换，不依赖真实等待。
  let pending = [];
  const context = {
    module: {exports: {}},
    require: () => game,
    setTimeout: (fn, ms) => {
      pending.push({fn, ms});
      return pending.length;
    },
    clearTimeout: () => {
      pending = [];
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/replay.js'), 'utf8'), context);
  const player = new context.module.exports.ReplayPlayer(original);
  player.play();
  player.setSpeed(4);
  eq(pending.at(-1).ms, 225, '播放中变速立即重新安排下一帧');
  player.dispose();
  eq(pending.length, 0, '释放回放清理计时器');
};
