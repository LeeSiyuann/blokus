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
    if (o.seatIds !== undefined && (!Array.isArray(o.seatIds) || o.seatIds.length < 2 || o.seatIds.length > 4)) throw new Error('invalid_seats');
    const seatIds = (o.seatIds && o.seatIds.length >= 2 && o.seatIds.length <= 4)
      ? o.seatIds.slice()
      : (SEATS[o.seatCount || 4] || SEATS[4]);
    if (!seatIds.every((i) => Number.isInteger(i) && i >= 0 && i < 4) || new Set(seatIds).size !== seatIds.length) throw new Error('invalid_seats');
    if (o.seatCount !== undefined && o.seatCount !== seatIds.length) throw new Error('invalid_seats');
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
      startedAt: o.startedAt === undefined ? now : o.startedAt,
      updatedAt: o.startedAt === undefined ? now : o.startedAt,
      finishedAt: null,
      status: 'playing',
      mode: o.mode || 'hotseat',
      lang: o.lang || 'zh',
      sound: o.sound !== false,
      seatCount,
      seatIds,
      players,
      turn: 0,
      turnStartedAt: o.startedAt === undefined ? now : o.startedAt,
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

  function advanceTurn(state, ts) {
    const n = state.players.length;
    for (let step = 1; step <= n; step++) {
      const next = (state.turn + step) % n;
      if (eligible(state, next)) {
        state.turn = next;
        state.turnStartedAt = ts === undefined ? Date.now() : ts;
        return true;
      }
    }
    finish(state, ts);
    return false;
  }

  function finish(state, ts) {
    if (state.status === 'finished') return;
    state.status = 'finished';
    state.finishedAt = ts === undefined ? Date.now() : ts;
    state.result = rules.computeResult(state);
  }

  /**
   * 应用一个动作（人类点击与 AI 决策共用通道）。
   * @param {object} state
   * @param {object} action { type:'place'|'pass'|'resign', piece?, anchor?, rot?, mirror? }
   * @param {object} [opts] { validate:boolean=true, ts:number, elapsedMs:number }
   * @returns {{ok:boolean, code?:string, move?:object}}
   */
  function applyAction(state, action, opts) {
    const o = opts || {};
    if (state.status !== 'playing') return { ok: false, code: 'game_over' };
    if (!action || typeof action !== 'object') return { ok: false, code: 'bad_action' };
    const p = state.turn;
    if (action.player !== undefined && action.player !== p) return { ok: false, code: 'wrong_player' };
    if (action.n !== undefined && action.n !== state.moves.length + 1) return { ok: false, code: 'wrong_sequence' };
    const ts = o.ts === undefined ? Date.now() : o.ts;
    if (!Number.isFinite(ts) || ts < 0 || (o.elapsedMs !== undefined && (!Number.isFinite(o.elapsedMs) || o.elapsedMs < 0))) return { ok: false, code: 'bad_action' };
    const elapsedMs = o.elapsedMs === undefined ? Math.max(0, ts - state.turnStartedAt) : o.elapsedMs;

    if (action.type === 'pass' || action.type === 'resign') {
      if (action.type === 'pass' && o.validate !== false && rules.hasAnyMove(state, p)) return { ok: false, code: 'has_moves' };
      state.players[p].passed = true;
      state.consecutivePasses++;
      const move = { n: state.moves.length + 1, player: p, type: action.type, ts, elapsedMs };
      state.moves.push(move);
      state.updatedAt = ts;
      if (rules.isFinished(state)) finish(state, ts); else advanceTurn(state, ts);
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

    if (rules.isFinished(state)) finish(state, ts); else advanceTurn(state, ts);
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
      mode: source.mode, seatCount: source.seatCount || source.players.length, lang: source.lang, sound: source.sound,
      seatIds: source.seatIds,
      id: source.id, createdAt: source.createdAt, startedAt: source.startedAt,
      server: source.server,
      players: source.players.map((p) => ({ name: p.name, controller: p.controller, ai: p.ai }))
    });
    for (const [i, m] of (moves || []).entries()) {
      if (!m || !Number.isInteger(m.player) || !Number.isInteger(m.n)) throw new Error('invalid_move:' + (i + 1));
      const res = applyAction(state, m, { ts: m.ts === undefined ? state.turnStartedAt : m.ts, elapsedMs: m.elapsedMs });
      if (!res.ok) throw new Error('invalid_move:' + (i + 1) + ':' + res.code);
    }
    state.warnings = 0;
    if (state.status === 'finished' && Number.isFinite(source.finishedAt)) {
      state.finishedAt = source.finishedAt;
      state.result = rules.computeResult(state);
    }
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
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid_record');
    if (obj.version !== undefined && obj.version !== VERSION) throw new Error('unsupported_format_version');
    if (!Array.isArray(obj.players) || obj.players.length < 2 || obj.players.length > 4 ||
        obj.players.some((p) => !p || typeof p.name !== 'string' || p.name.length > 120)) throw new Error('invalid_players');
    if (obj.mode !== undefined && !['hotseat','lan'].includes(obj.mode)) throw new Error('invalid_mode');
    if (!Array.isArray(obj.moves) || obj.moves.length > obj.players.length * 22) throw new Error('invalid_moves');
    if (obj.seatIds !== undefined && (!Array.isArray(obj.seatIds) || obj.seatIds.length !== obj.players.length)) throw new Error('invalid_seats');
    if (obj.id !== undefined && (typeof obj.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(obj.id))) throw new Error('invalid_id');
    if (obj.createdAt !== undefined && !Number.isFinite(Date.parse(obj.createdAt))) throw new Error('invalid_time');
    for (const key of ['startedAt','updatedAt','finishedAt','turnStartedAt']) {
      if (obj[key] !== undefined && obj[key] !== null && (!Number.isFinite(obj[key]) || obj[key] < 0)) throw new Error('invalid_time');
    }
    const state = rebuild(obj, obj.moves);
    if (obj.players.some((p, i) => p.id !== undefined && p.id !== state.players[i].id)) throw new Error('invalid_seats');
    if (obj.board !== undefined && (!Array.isArray(obj.board) || obj.board.length !== 20 ||
        obj.board.some((row) => !Array.isArray(row) || row.length !== 20 || row.some((v) => !Number.isInteger(v) || v < -1 || v >= state.seatCount)) ||
        JSON.stringify(obj.board.flat()) !== JSON.stringify([...state.board]))) throw new Error('snapshot_mismatch');
    if (obj.remaining !== undefined && JSON.stringify(obj.remaining) !== JSON.stringify(state.remaining)) throw new Error('snapshot_mismatch');
    if (obj.status !== undefined && obj.status !== state.status) throw new Error('snapshot_mismatch');
    if (obj.turn !== undefined && obj.turn !== state.turn) throw new Error('snapshot_mismatch');
    if (obj.updatedAt !== undefined) state.updatedAt = obj.updatedAt;
    if (obj.turnStartedAt !== undefined) state.turnStartedAt = obj.turnStartedAt;
    if (state.status === 'finished') {
      if (obj.finishedAt !== undefined && obj.finishedAt !== null) state.finishedAt = obj.finishedAt;
      state.result = rules.computeResult(state);
    }
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

