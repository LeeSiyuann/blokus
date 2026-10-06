/* render.js — Canvas 棋盘渲染（对局 / 回放共用） */
(function (global) {
  'use strict';

  const BKNS = (typeof window !== 'undefined' && window.BK) ? window.BK : global.BK;
  const rules = BKNS;
  const pieces = BKNS;
  const SIZE = 20;

  const COLORS = {
    blue: { fill: '#3b82f6', light: '#93c5fd', dark: '#1d4ed8' },
    yellow: { fill: '#eab308', light: '#fde68a', dark: '#a16207' },
    red: { fill: '#ef4444', light: '#fca5a5', dark: '#b91c1c' },
    green: { fill: '#22c55e', light: '#86efac', dark: '#15803d' }
  };
  const ORDER = ['blue', 'yellow', 'red', 'green'];

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawPieceThumb(canvas, pieceId, colorId, rot, mirror) {
    const piece = pieces.PIECES[pieceId];
    if (!piece || !canvas) return;
    const dpr = global.devicePixelRatio || 1;
    const w = canvas.clientWidth || 56, h = canvas.clientHeight || 56;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cells = pieces.cellsFor(pieceId, rot || 0, mirror ? 1 : 0);
    let maxR = 0, maxC = 0;
    for (const [r, c] of cells) { if (r > maxR) maxR = r; if (c > maxC) maxC = c; }
    const cell = Math.min((w - 8) / (maxC + 1), (h - 8) / (maxR + 1));
    const ox = (w - cell * (maxC + 1)) / 2, oy = (h - cell * (maxR + 1)) / 2;
    const col = COLORS[colorId] || COLORS.blue;
    for (const [r, c] of cells) {
      roundRect(ctx, ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2, Math.max(2, cell * 0.18));
      ctx.fillStyle = col.fill; ctx.fill();
      ctx.strokeStyle = col.dark; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.state = null;
      this.opts = { preview: null, lastMove: null, selected: null, dimNonTurn: false };
    }

    setState(state, opts) {
      this.state = state;
      this.opts = Object.assign({ preview: null, lastMove: null, selected: null }, opts || {});
    }

    layout() {
      const dpr = global.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const cssSize = Math.max(240, Math.floor(Math.min(rect.width || 640, rect.height || 640)));
      const px = Math.round(cssSize * dpr);
      if (this.canvas.width !== px || this.canvas.height !== px) {
        this.canvas.width = px;
        this.canvas.height = px;
      }
      const pad = Math.round(cssSize * 0.045) + 10;
      const cell = (cssSize - pad * 2) / SIZE;
      return { dpr, cssSize, pad, cell };
    }

    draw() {
      if (!this.ctx) return;
      const { dpr, pad, cell } = this.layout();
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = this.canvas.width / dpr;
      ctx.clearRect(0, 0, size, size);

      // 棋盘底
      roundRect(ctx, 2, 2, size - 4, size - 4, 10);
      ctx.fillStyle = '#f8fafc'; ctx.fill();
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.stroke();

      // 网格
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      for (let i = 0; i <= SIZE; i++) {
        const p = pad + i * cell;
        ctx.beginPath(); ctx.moveTo(p, pad); ctx.lineTo(p, pad + SIZE * cell); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad, p); ctx.lineTo(pad + SIZE * cell, p); ctx.stroke();
      }
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
      ctx.strokeRect(pad, pad, SIZE * cell, SIZE * cell);

      // 起始角标记
      if (this.state) {
        this.state.players.forEach((p) => {
          const col = COLORS[p.id] || COLORS.blue;
          const cx = pad + (p.corner[1] + 0.5) * cell;
          const cy = pad + (p.corner[0] + 0.5) * cell;
          ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, cell * 0.18), 0, Math.PI * 2);
          ctx.fillStyle = col.fill; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
        });
      }

      // 坐标
      ctx.fillStyle = '#64748b';
      ctx.font = Math.max(9, Math.round(cell * 0.5)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < SIZE; i++) {
        if (i % 2 === 0) {
          ctx.fillText(String.fromCharCode(65 + i), pad + (i + 0.5) * cell, size - pad / 2 - 2);
          ctx.fillText(String(i + 1), pad / 2 + 2, pad + (i + 0.5) * cell);
        }
      }

      if (!this.state) return;
      const bstate = this.state;
      const moves = bstate.moves || [];
      const lastIndex = moves.length - 1;
      const r = Math.max(2, cell * 0.16);

      // 已落子（按 moves 分组绘制，保留边界）
      for (let mi = 0; mi < moves.length; mi++) {
        const m = moves[mi];
        if (m.type !== 'place' || !m.cells) continue;
        const colorId = bstate.players[m.player] && bstate.players[m.player].id;
        const col = COLORS[colorId] || COLORS.blue;
        for (const [rr, cc] of m.cells) {
          const x = pad + cc * cell + 1.5, y = pad + rr * cell + 1.5;
          const w = cell - 3;
          roundRect(ctx, x, y, w, w, r);
          ctx.fillStyle = col.fill; ctx.fill();
          ctx.strokeStyle = col.dark; ctx.lineWidth = 1; ctx.stroke();
        }
      }

      // 最后一手高亮
      if (lastIndex >= 0 && moves[lastIndex] && moves[lastIndex].type === 'place') {
        const m = moves[lastIndex];
        ctx.save();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
        for (const [rr, cc] of m.cells) {
          const x = pad + cc * cell + 1.5, y = pad + rr * cell + 1.5;
          roundRect(ctx, x, y, cell - 3, cell - 3, r);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 预览
      const pv = this.opts.preview;
      if (pv && pv.cells) {
        ctx.save();
        for (const [rr, cc] of pv.cells) {
          const x = pad + cc * cell + 1.5, y = pad + rr * cell + 1.5;
          roundRect(ctx, x, y, cell - 3, cell - 3, r);
          ctx.fillStyle = pv.ok ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.42)';
          ctx.fill();
          ctx.strokeStyle = pv.ok ? '#15803d' : '#b91c1c';
          ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.restore();
      }
    }

    /** 将客户端坐标转换为棋盘行列；返回 {r,c} 或 null */
    toCell(clientX, clientY) {
      if (!this.canvas) return null;
      const rect = this.canvas.getBoundingClientRect();
      const { pad, cell } = this.layout();
      const x = clientX - rect.left, y = clientY - rect.top;
      const c = Math.floor((x - pad) / cell), r = Math.floor((y - pad) / cell);
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
      return { r, c };
    }
  }

  const api = { Renderer, COLORS, ORDER, drawPieceThumb, roundRect, SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

