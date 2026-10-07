/* game.js — 对局状态机（唯一状态源；浏览器 / Node 双端复用；AI 与网络挂载点） */
(function (global) {
  'use strict';

  const isNode = (typeof require === 'function' && typeof module !== 'undefined');
  const pieces = isNode ? require('./pieces.js') : (typeof window !== 'undefined' ? window.BK : global.BK);
  const rules = isNode ? require('./rules.js') : (typeof window !== 'undefined' ? window.BK : global.BK);
  const { ALL_PIECE_IDS, PIECES } = pieces;

  const SEATS = {
    2: [0, 2],
    3: [0, 1, 3],
    4: [0, 1, 2, 3]
  };
  const PLAYER_META = [
    { id: 'blue', corner: [0, 0] },
    { id: 'yellow', corner: [0, 19] },
    { id: 'red', corner: [19, 19] },
    { id: 'green', corner: [19, 0] }
  ];
  const VERSION = 1;
  const RULES_VERSION = 2;
  function recordRulesVersion(source) {
    const value = source.rulesVersion === undefined ? 1 : source.rulesVersion;
    if (value !== 1 && value !== RULES_VERSION) throw new Error('unsupported_rules_version');
    return value;
  }

  function makeId(date) {
    const d = date ? new Date(date) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    const rand = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
    return 'g_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '_' + rand;
  }

  /**
   * 创建对局。
   * @param {object} opts { mode, seatCount, players:[{name,controller,ai}], lang, sound, id, createdAt, server, rulesVersion=2（1 仅用于旧棋谱解释） }
   */
  function createGame(opts) {
    const o = opts || {};
    const rulesVersion = recordRulesVersion({ rulesVersion: o.rulesVersion === undefined ? RULES_VERSION : o.rulesVersion });
    const seatIds = (o.seatIds && o.seatIds.length >= 2 && o.seatIds.length <= 4)
      ? o.seatIds.slice()
      : (SEATS[o.seatCount || 4] || SEATS[4]);
    const seatCount = seatIds.length;
    const now = Date.now();
    const players = seatIds.map((globalIdx, i) => {
      const meta = PLAYER_META[globalIdx];
      const src = (o.players && o.players[i]) || {};
      return {
        id: meta.id,
        name: src.name || ('P' + (i + 1)),
        controller: src.controller || 'human',
        ai: src.ai || null,
        corner: meta.corner.slice(),
        passed: false,
        finished: false
      };
    });
    return {
      version: VERSION, rulesVersion,
      id: o.id || makeId(o.createdAt),
      createdAt: o.createdAt || new Date(now).toISOString(),
      startedAt: o.startedAt || now,
      updatedAt: now,
      finishedAt: null,
      status: 'playing',
      mode: o.mode || 'hotseat',
      lang: o.lang || 'zh',
      sound: o.sound !== false,
      seatCount,
      seatIds,
      players,
      turn: 0,
      turnStartedAt: now,
      consecutivePasses: 0,
      board: rules.newBoard(),
      remaining: players.map(() => ALL_PIECE_IDS.slice()),
      moves: [],
      result: null,
      server: o.server || null
    };
  }

  function eligible(state, i) {
    return !state.players[i].passed && (state.remaining[i] || []).length > 0;
  }

  function advanceTurn(state) {
    const n = state.players.length;
    for (let step = 1; step <= n; step++) {
      const next = (state.turn + step) % n;
      if (eligible(state, next)) {
        state.turn = next;
        state.turnStartedAt = Date.now();
        return true;
      }
    }
    finish(state);
    return false;
  }

  function finish(state) {
    if (state.status === 'finished') return;
    state.status = 'finished';
    state.finishedAt = Date.now();
    state.result = rules.computeResult(state);
  }

  /**
   * 应用一个动作（人类点击与 AI 决策共用通道）。
   * @param {object} state
   * @param {object} action { type:'place'|'pass', piece?, anchor?, rot?, mirror? }
   * @param {object} [opts] { validate:boolean=true, ts:number }
   * @returns {{ok:boolean, code?:string, move?:object}}
   */
  function applyAction(state, action, opts) {
    const o = opts || {};
    if (state.status !== 'playing') return { ok: false, code: 'game_over' };
    const p = state.turn;
    const ts = o.ts || Date.now();
    const elapsedMs = Math.max(0, ts - (state.turnStartedAt || ts));

    if (action.type === 'pass') {
      if (o.validate !== false && rules.hasAnyMove(state, p)) return { ok: false, code: 'has_moves' };
      state.players[p].passed = true;
      state.consecutivePasses++;
      const move = { n: state.moves.length + 1, player: p, type: 'pass', ts, elapsedMs };
      state.moves.push(move);
      state.updatedAt = ts;
      if (rules.isFinished(state)) finish(state); else advanceTurn(state);
      return { ok: true, move };
    }

    if (action.type !== 'place') return { ok: false, code: 'bad_action' };
    const res = rules.canPlace(state, p, action.piece, action.rot, action.mirror, action.anchor);
    if (!res.ok) return { ok: false, code: res.code };
    const cells = res.cells;
    const move = {
      n: state.moves.length + 1,
      player: p,
      type: 'place',
      piece: action.piece,
      anchor: action.anchor.slice(),
      rot: action.rot || 0,
      mirror: action.mirror ? 1 : 0,
      cells,
      ts,
      elapsedMs
    };
    if (action.reason) move.reason = String(action.reason).slice(0, 200);

    for (const [r, c] of cells) state.board[rules.idx(r, c)] = p;
    const rem = state.remaining[p];
    rem.splice(rem.indexOf(action.piece), 1);
    if (rem.length === 0) state.players[p].finished = true;
    state.moves.push(move);
    state.consecutivePasses = 0;
    state.updatedAt = ts;

    if (rules.isFinished(state)) finish(state); else advanceTurn(state);
    return { ok: true, move };
  }

  /** 悔棋：丢弃最后一步并从 moves[] 重建（回放同一套逻辑） */
  function undo(state) {
    if (!state.moves.length) return { ok: false, code: 'no_moves' };
    const trimmed = state.moves.slice(0, -1);
    const rebuilt = rebuild(state, trimmed);
    Object.assign(state, rebuilt);
    return { ok: true };
  }

  /** 由配置 + moves 重建完整状态（回放 / 导入 / 悔棋 共用） */
  function rebuild(source, moves) {
    const state = createGame({
      rulesVersion: recordRulesVersion(source),
      mode: source.mode, seatCount: source.seatCount, lang: source.lang, sound: source.sound,
      seatIds: source.seatIds,
      id: source.id, createdAt: source.createdAt, startedAt: source.startedAt,
      server: source.server,
      players: source.players.map((p) => ({ name: p.name, controller: p.controller, ai: p.ai }))
    });
    let warnings = 0;
    for (const m of (moves || [])) {
      const res = applyAction(state, m, { ts: m.ts || Date.now() });
      if (!res.ok) warnings++;
    }
    state.warnings = warnings;
    return state;
  }

  /** 回放到第 k 步（0 = 初始局面） */
  function replayTo(source, k) {
    return rebuild(source, source.moves.slice(0, Math.max(0, Math.min(k, source.moves.length))));
  }

  function toJSON(state) {
    const board = [];
    for (let r = 0; r < rules.SIZE; r++) {
      const row = [];
      for (let c = 0; c < rules.SIZE; c++) row.push(state.board[rules.idx(r, c)]);
      board.push(row);
    }
    return {
      version: VERSION, rulesVersion: recordRulesVersion(state),
      id: state.id, createdAt: state.createdAt, startedAt: state.startedAt,
      updatedAt: state.updatedAt, finishedAt: state.finishedAt,
      status: state.status, mode: state.mode, lang: state.lang, sound: state.sound,
      seatCount: state.seatCount, seatIds: state.seatIds,
      players: state.players.map((p) => ({
        id: p.id, name: p.name, controller: p.controller, ai: p.ai,
        corner: p.corner.slice(), passed: !!p.passed, finished: !!p.finished
      })),
      turn: state.turn, turnStartedAt: state.turnStartedAt,
      consecutivePasses: state.consecutivePasses,
      board, remaining: state.remaining.map((r) => r.slice()),
      moves: state.moves.map((m) => Object.assign({}, m, { anchor: m.anchor ? m.anchor.slice() : undefined, cells: m.cells ? m.cells.map((x) => x.slice()) : undefined })),
      result: state.result, server: state.server
    };
  }

  function fromJSON(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('invalid game record');
    if (!Array.isArray(obj.players) || obj.players.length < 2 || obj.players.length > 4) throw new Error('invalid players');
    if (!Array.isArray(obj.moves)) throw new Error('invalid moves');
    if (obj.moves.length > 5000) throw new Error('too many moves');
    const state = createGame({
      rulesVersion: recordRulesVersion(obj),
      mode: obj.mode, seatCount: obj.seatCount || obj.players.length,
      seatIds: obj.seatIds,
      lang: obj.lang, sound: obj.sound, id: obj.id, createdAt: obj.createdAt,
      startedAt: obj.startedAt, server: obj.server,
      players: obj.players.map((p) => ({ name: p.name, controller: p.controller, ai: p.ai }))
    });
    let warnings = 0;
    for (const m of obj.moves) {
      const res = applyAction(state, m, { ts: m.ts || Date.now() });
      if (!res.ok) warnings++;
    }
    state.warnings = warnings;
    if (obj.finishedAt) state.finishedAt = obj.finishedAt;
    return state;
  }

  /** 供 UI 显示"当前玩家该做什么" */
  function turnInfo(state) {
    if (state.status === 'finished') return { status: 'finished', player: null };
    const p = state.turn;
    return {
      status: 'playing',
      player: p,
      playerId: state.players[p].id,
      mustPass: rules.mustPass(state, p),
      remainingCount: state.remaining[p].length,
      remainingSquares: rules.remainingSquares(state, p)
    };
  }

  const api = {
    VERSION, RULES_VERSION, recordRulesVersion, SEATS, PLAYER_META, makeId, createGame, applyAction, undo, rebuild, replayTo,
    toJSON, fromJSON, turnInfo, finish, eligible, advanceTurn
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

