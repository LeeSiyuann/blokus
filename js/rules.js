/* rules.js — 规则判定与计分（纯函数，浏览器 / Node 双端复用） */
(function (global) {
  'use strict';

  const pieces = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./pieces.js')
    : (typeof window !== 'undefined' ? window.BK : global.BK);
  const { PIECES, ALL_PIECE_IDS, cellsFor } = pieces;

  const SIZE = 20;
  const EMPTY = -1;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const idx = (r, c) => r * SIZE + c;
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const cellAt = (board, r, c) => (inBounds(r, c) ? board[idx(r, c)] : -2); // -2 = 越界哨兵

  function newBoard() { return new Int8Array(SIZE * SIZE).fill(EMPTY); }

  function placedCount(state, playerIndex) {
    let n = 0;
    for (let i = 0; i < state.board.length; i++) if (state.board[i] === playerIndex) n++;
    return n;
  }

  function isFirstMove(state, playerIndex) {
    return placedCount(state, playerIndex) === 0;
  }

  /**
   * 校验落子合法性。
   * @returns {{ok:boolean, code?:string, cells?:number[][]}}
   */
  function canPlace(state, playerIndex, pieceId, rot, mirror, anchor) {
    if (!Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isInteger) ||
        ![0,90,180,270].includes(rot === undefined ? 0 : rot) || ![0,1,false,true,undefined].includes(mirror)) {
      return { ok: false, code: 'bad_action' };
    }
    const piece = PIECES[pieceId];
    if (!piece) return { ok: false, code: 'unknown_piece' };
    const remaining = state.remaining[playerIndex] || [];
    if (remaining.indexOf(pieceId) === -1) return { ok: false, code: 'piece_used' };
    const base = cellsFor(pieceId, rot, mirror);
    const cells = base.map(([r, c]) => [r + anchor[0], c + anchor[1]]);

    for (const [r, c] of cells) {
      if (!inBounds(r, c)) return { ok: false, code: 'out_of_bounds' };
      if (state.board[idx(r, c)] !== EMPTY) return { ok: false, code: 'overlap' };
    }

    const first = isFirstMove(state, playerIndex);
    if (first) {
      const corner = state.players[playerIndex].corner;
      const covers = cells.some(([r, c]) => r === corner[0] && c === corner[1]);
      if (!covers) return { ok: false, code: 'not_corner' };
    }

    let ownEdge = 0, oppEdge = 0, ownCorner = false;
    for (const [r, c] of cells) {
      for (const [dr, dc] of DIRS) {
        const v = cellAt(state.board, r + dr, c + dc);
        if (v === EMPTY || v < 0) continue;
        if (v === playerIndex) ownEdge++;
        else oppEdge++;
      }
      for (const dr of [-1, 1]) {
        for (const dc of [-1, 1]) {
          if (cellAt(state.board, r + dr, c + dc) === playerIndex) ownCorner = true;
        }
      }
    }
    // v1 仅用于解释旧棋谱，不能把旧着法按新规则静默丢弃。
    if (state.rulesVersion === 1) {
      if (oppEdge > 0) return { ok: false, code: 'touch_opponent' };
      if (!first && ownEdge === 0) return { ok: false, code: 'no_own_edge' };
    } else {
      if (ownEdge > 0) return { ok: false, code: 'own_edge' };
      if (!first && !ownCorner) return { ok: false, code: 'no_own_corner' };
    }

    return { ok: true, cells };
  }

  /** 可连接的空格：首子起始角；标准为角点，旧版为边邻点。 */
  function connectionCells(state, playerIndex) {
    const targets = new Set();
    let first = true;
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] !== playerIndex) continue;
      first = false;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      const dirs = state.rulesVersion === 1 ? DIRS : [[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr, dc] of dirs) {
        const rr = r + dr, cc = c + dc;
        if (!inBounds(rr, cc) || cellAt(state.board, rr, cc) !== EMPTY) continue;
        if (state.rulesVersion !== 1 && DIRS.some(([er, ec]) => cellAt(state.board, rr + er, cc + ec) === playerIndex)) continue;
        targets.add(idx(rr, cc));
      }
    }
    if (first && state.players[playerIndex]) {
      const [r, c] = state.players[playerIndex].corner;
      if (cellAt(state.board, r, c) === EMPTY) targets.add(idx(r, c));
    }
    return [...targets].sort((a, b) => a - b).map((i) => [Math.floor(i / SIZE), i % SIZE]);
  }

  /** 枚举候选锚点后仍由 canPlace 裁判；排序保留原穷举的稳定顺序。 */
  function legalPlacements(state, playerIndex, pieceId, limit, targets) {
    const piece = PIECES[pieceId];
    if (!piece || !(state.remaining[playerIndex] || []).includes(pieceId)) return [];
    const out = [];
    const max = limit === undefined ? Infinity : limit;
    if (max <= 0) return out;
    const connections = targets || connectionCells(state, playerIndex);
    for (const o of piece.orientations) {
      let maxR = 0, maxC = 0;
      for (const [r, c] of o.cells) { if (r > maxR) maxR = r; if (c > maxC) maxC = c; }
      const anchors = new Set();
      for (const [r, c] of connections) {
        for (const [dr, dc] of o.cells) {
          const ar = r - dr, ac = c - dc;
          if (ar >= 0 && ac >= 0 && ar + maxR < SIZE && ac + maxC < SIZE) anchors.add(idx(ar, ac));
        }
      }
      for (const a of [...anchors].sort((a, b) => a - b)) {
        const anchor = [Math.floor(a / SIZE), a % SIZE];
        const res = canPlace(state, playerIndex, pieceId, o.rot, o.mirror, anchor);
        if (res.ok) out.push({ piece: pieceId, rot: o.rot, mirror: o.mirror, anchor, cells: res.cells });
        if (out.length >= max) return out;
      }
    }
    return out;
  }

  /** 是否存在合法落子（非 pass） */
  function hasAnyMove(state, playerIndex) {
    const remaining = state.remaining[playerIndex] || [];
    const targets = connectionCells(state, playerIndex);
    for (const pieceId of remaining) {
      if (legalPlacements(state, playerIndex, pieceId, 1, targets).length > 0) return true;
    }
    return false;
  }

  function mustPass(state, playerIndex) {
    const remaining = state.remaining[playerIndex] || [];
    if (remaining.length === 0) return false;
    if (state.players[playerIndex].passed) return false;
    return !hasAnyMove(state, playerIndex);
  }

  /** 枚举全部合法动作（含无法落子时的 pass） */
  function allLegalActions(state, playerIndex, limit) {
    if (state.status !== 'playing' || !state.players[playerIndex] || state.players[playerIndex].passed || !(state.remaining[playerIndex] || []).length) return [];
    const actions = [];
    const max = limit === undefined || limit === Infinity ? Infinity :
      Number.isInteger(limit) && limit > 0 ? limit : 0;
    if (max === 0) return actions;
    const targets = connectionCells(state, playerIndex);
    for (const pieceId of (state.remaining[playerIndex] || [])) {
      for (const p of legalPlacements(state, playerIndex, pieceId, max - actions.length, targets)) {
        actions.push({ type: 'place', piece: p.piece, rot: p.rot, mirror: p.mirror, anchor: p.anchor });
        if (actions.length >= max) return actions;
      }
    }
    if (actions.length === 0 && state.status === 'playing' && state.turn === playerIndex && !state.players[playerIndex].passed && state.remaining[playerIndex].length) actions.push({ type: 'pass' });
    return actions;
  }

  function remainingSquares(state, playerIndex) {
    let n = 0;
    for (const id of (state.remaining[playerIndex] || [])) n += PIECES[id].size;
    return n;
  }

  function lastPlacedPiece(state, playerIndex) {
    for (let i = state.moves.length - 1; i >= 0; i--) {
      const m = state.moves[i];
      if (m.player === playerIndex && m.type === 'place') return m.piece;
    }
    return null;
  }

  /** 标准计分：全部出完 +15，最后一手为 I1 再加 5；否则 -剩余格数。 */
  function scoreFor(state, playerIndex) {
    const rem = remainingSquares(state, playerIndex);
    if (rem > 0) return -rem;
    const singleLast = lastPlacedPiece(state, playerIndex) === 'I1';
    if (state.rulesVersion === 1) return singleLast ? 15 : 20;
    return singleLast ? 20 : 15;
  }

  function isFinished(state) {
    return state.players.every((p, i) => p.passed || (state.remaining[i] || []).length === 0);
  }

  function computeResult(state) {
    const scores = {}, bonus = {}, remaining = {};
    state.players.forEach((p, i) => {
      const rem = remainingSquares(state, i);
      remaining[p.id] = rem;
      scores[p.id] = scoreFor(state, i);
      bonus[p.id] = rem === 0 ? scores[p.id] : 0;
    });
    const ranking = state.players.map((p) => p.id)
      .sort((a, b) => scores[b] - scores[a]);
    const winners = ranking.filter((id) => scores[id] === scores[ranking[0]]);
    return {
      scores, bonus, remainingSquares: remaining, ranking, winners,
      moveCount: state.moves.length,
      durationMs: (state.finishedAt === null || state.finishedAt === undefined ? Date.now() : state.finishedAt) - state.startedAt
    };
  }

  const api = {
    SIZE, EMPTY, DIRS, idx, inBounds, cellAt, newBoard,
    canPlace, legalPlacements, hasAnyMove, mustPass, allLegalActions,
    remainingSquares, lastPlacedPiece, scoreFor, isFinished, computeResult, placedCount
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

