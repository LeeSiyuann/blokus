/* pieces.js — 21 种标准 Blokus 棋子定义与朝向变换（浏览器 / Node 双端复用） */
(function (global) {
  'use strict';

  // 每种棋子的基础形状：cells 为 [row, col]，已归一化（最小行/列为 0）
  const RAW = {
    I1: [[0, 0]],
    I2: [[0, 0], [0, 1]],
    I3: [[0, 0], [0, 1], [0, 2]],
    L3: [[0, 0], [1, 0], [1, 1]],
    I4: [[0, 0], [0, 1], [0, 2], [0, 3]],
    O4: [[0, 0], [0, 1], [1, 0], [1, 1]],
    T4: [[0, 0], [0, 1], [0, 2], [1, 1]],
    L4: [[0, 0], [1, 0], [2, 0], [2, 1]],
    S4: [[0, 1], [0, 2], [1, 0], [1, 1]],
    F5: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
    I5: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
    L5: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]],
    N5: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]],
    P5: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
    T5: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
    U5: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]],
    V5: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
    W5: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],
    X5: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
    Y5: [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]],
    Z5: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]
  };

  const PIECE_ORDER = ['I1', 'I2', 'I3', 'L3', 'I4', 'O4', 'T4', 'L4', 'S4',
    'F5', 'I5', 'L5', 'N5', 'P5', 'T5', 'U5', 'V5', 'W5', 'X5', 'Y5', 'Z5'];

  function normalize(cells) {
    let minR = Infinity, minC = Infinity;
    for (const [r, c] of cells) { if (r < minR) minR = r; if (c < minC) minC = c; }
    return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function key(cells) { return cells.map(([r, c]) => r + ',' + c).join(';'); }

  function rotateCW(cells) { return cells.map(([r, c]) => [c, -r]); }
  function mirrorH(cells) { return cells.map(([r, c]) => [r, -c]); }

  /** 按 rot(0/90/180/270) 与 mirror(0/1) 变换棋子格子，返回归一化副本 */
  function orientCells(cells, rot, mirror) {
    let out = cells.map(([r, c]) => [r, c]);
    if (mirror) out = mirrorH(out);
    const turns = ((Math.round((rot || 0) / 90) % 4) + 4) % 4;
    for (let i = 0; i < turns; i++) out = rotateCW(out);
    return normalize(out);
  }

  /** 某棋子的全部唯一朝向（去重），用于 UI 轮换 */
  function generateOrientations(pieceId) {
    const base = RAW[pieceId];
    const seen = new Set();
    const list = [];
    for (let m = 0; m <= 1; m++) {
      for (let k = 0; k < 4; k++) {
        const cells = orientCells(base, k * 90, m);
        const kk = key(cells);
        if (!seen.has(kk)) { seen.add(kk); list.push({ rot: k * 90, mirror: m, cells }); }
      }
    }
    return list;
  }

  const PIECES = {};
  for (const id of PIECE_ORDER) {
    const cells = normalize(RAW[id]);
    let maxR = 0, maxC = 0;
    for (const [r, c] of cells) { if (r > maxR) maxR = r; if (c > maxC) maxC = c; }
    PIECES[id] = {
      id,
      size: cells.length,
      cells,
      height: maxR + 1,
      width: maxC + 1,
      orientations: generateOrientations(id)
    };
  }

  const ALL_PIECE_IDS = PIECE_ORDER.slice();
  const TOTAL_SQUARES = PIECE_ORDER.reduce((s, id) => s + PIECES[id].size, 0);

  /** 取某棋子指定朝向的格子；越界/非法朝向回退到基础形状 */
  function cellsFor(pieceId, rot, mirror) {
    const piece = PIECES[pieceId];
    if (!piece) return null;
    return orientCells(piece.cells, rot || 0, mirror ? 1 : 0);
  }

  const api = { PIECES, PIECE_ORDER, ALL_PIECE_IDS, TOTAL_SQUARES, orientCells, cellsFor, generateOrientations };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

