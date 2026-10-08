'use strict';
const rules = require('../js/rules');
const {PIECES} = require('../js/pieces');

// 独立保留遍历全部棋盘锚点的参考枚举器，不使用优化候选集。
module.exports = function brute(state, player, pieceId) {
  const out = [];
  for (const o of PIECES[pieceId].orientations) {
    const maxR = Math.max(...o.cells.map(c => c[0]));
    const maxC = Math.max(...o.cells.map(c => c[1]));
    for (let r = 0; r + maxR < 20; r++) {
      for (let c = 0; c + maxC < 20; c++) {
        const res = rules.canPlace(state, player, pieceId, o.rot, o.mirror, [r, c]);
        if (res.ok)
          out.push({piece: pieceId, rot: o.rot, mirror: o.mirror, anchor: [r, c], cells: res.cells});
      }
    }
  }
  return out;
};
