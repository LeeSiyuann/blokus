/* notation.js — 棋谱编解码：BKS1 文本 + JSON（浏览器 / Node 双端复用） */
(function (global) {
  'use strict';

  const isNode = (typeof require === 'function' && typeof module !== 'undefined');
  const pieces = isNode ? require('./pieces.js') : (typeof window !== 'undefined' ? window.BK : global.BK);
  const game = isNode ? require('./game.js') : (typeof window !== 'undefined' ? window.BK : global.BK);
  const { PIECES } = pieces;

  const LETTERS = 'ABCDEFGHIJKLMNOPQRST';
  const ID_TO_LETTER = { blue: 'B', yellow: 'Y', red: 'R', green: 'G' };
  const LETTER_TO_ID = { B: 'blue', Y: 'yellow', R: 'red', G: 'green' };
  const GLOBAL_ORDER = { B: 0, Y: 1, R: 2, G: 3 };

  const colLetter = (c) => LETTERS[c] || '?';
  const parsePos = (s) => {
    const m = /^([A-T])(\d{1,2})$/.exec(String(s || '').toUpperCase());
    if (!m) return null;
    const c = LETTERS.indexOf(m[1]);
    const r = parseInt(m[2], 10) - 1;
    if (r < 0 || r > 19) return null;
    return [r, c];
  };
  const pos = ([r, c]) => colLetter(c) + (r + 1);
  const pad3 = (n) => String(n).padStart(3, '0');

  /** 导出为 BKS1 文本棋谱 */
  function toText(state) {
    const lines = [];
    lines.push('BKS1');
    lines.push('Rules: ' + game.recordRulesVersion(state));
    lines.push('Game: ' + state.id);
    lines.push('Date: ' + state.createdAt);
    lines.push('Mode: ' + state.mode + (state.mode === 'lan' ? ' (LAN)' : ''));
    lines.push('Players: ' + state.players.map((p) => ID_TO_LETTER[p.id] + '=' + p.name).join(' '));
    if (state.result) {
      lines.push('Result: ' + state.players.map((p) => ID_TO_LETTER[p.id] + '=' + state.result.scores[p.id]).join(' '));
    }
    lines.push('Moves:');
    for (const m of state.moves) {
      const letter = ID_TO_LETTER[state.players[m.player].id];
      if (m.type === 'pass') {
        lines.push(m.n + '. ' + letter + ' PASS');
      } else {
        lines.push(m.n + '. ' + letter + ' ' + m.piece + ' ' + pos(m.anchor) +
          ' R' + pad3(m.rot || 0) + ' M' + (m.mirror ? 1 : 0));
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * 解析 BKS1 文本棋谱。
   * @returns {{ok:boolean, state?:object, error?:string}}
   */
  function parseText(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return { ok: false, error: 'empty' };
    const lines = raw.split('\n');
    if (lines[0].trim() !== 'BKS1') return { ok: false, error: 'bad_header' };

    const meta = { names: {}, result: null };
    let i = 1;
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^Moves:\s*$/i.test(line)) { i++; break; }
      const mPlayer = /^Players:\s*(.+)$/i.exec(line);
      if (mPlayer) {
        for (const part of mPlayer[1].trim().split(/\s+/)) {
          const kv = /^([BYRG])=(.*)$/.exec(part);
          if (kv) meta.names[kv[1]] = kv[2];
        }
        continue;
      }
      const mRules = /^Rules:\s*(.+)$/i.exec(line);
      if (mRules) { meta.rulesVersion = Number(mRules[1]); continue; }
      const mId = /^Game:\s*(.+)$/i.exec(line); if (mId) { meta.id = mId[1].trim(); continue; }
      const mDate = /^Date:\s*(.+)$/i.exec(line); if (mDate) { meta.createdAt = mDate[1].trim(); continue; }
      const mMode = /^Mode:\s*(\w+)/i.exec(line); if (mMode) { meta.mode = mMode[1].toLowerCase(); continue; }
    }

    const letters = Object.keys(meta.names).length
      ? Object.keys(meta.names).sort((a, b) => GLOBAL_ORDER[a] - GLOBAL_ORDER[b])
      : ['B', 'Y', 'R', 'G'];
    const players = letters.map((L) => ({
      name: meta.names[L] || LETTER_TO_ID[L],
      controller: 'human'
    }));
    const seatCount = players.length;
    if (meta.rulesVersion !== undefined && meta.rulesVersion !== 1 && meta.rulesVersion !== game.RULES_VERSION) {
      return { ok: false, error: 'unsupported_rules_version' };
    }
    const state = game.createGame({
      rulesVersion: meta.rulesVersion === undefined ? 1 : meta.rulesVersion,
      mode: meta.mode === 'lan' ? 'lan' : 'hotseat',
      seatCount, players,
      id: meta.id, createdAt: meta.createdAt
    });
    const indexOf = {};
    state.players.forEach((p, idx) => { indexOf[ID_TO_LETTER[p.id]] = idx; });

    const moves = [];
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^(\d+)\.\s*([BYRG])\s+(PASS|([A-Z]\d)\s+([A-T]\d{1,2})\s+R(\d{1,3})\s+M([01]))$/i.exec(line);
      if (!m) return { ok: false, error: 'bad_move_line', line };
      const letter = m[2].toUpperCase();
      const idx = indexOf[letter];
      if (idx === undefined) return { ok: false, error: 'unknown_player', line };
      if (/^PASS$/i.test(m[3])) {
        moves.push({ n: parseInt(m[1], 10), player: idx, type: 'pass' });
      } else {
        const anchor = parsePos(m[5]);
        if (!anchor) return { ok: false, error: 'bad_position', line };
        const pieceId = m[4].toUpperCase();
        if (!PIECES[pieceId]) return { ok: false, error: 'unknown_piece', line };
        moves.push({
          n: parseInt(m[1], 10), player: idx, type: 'place', piece: pieceId,
          anchor, rot: parseInt(m[6], 10) || 0, mirror: parseInt(m[7], 10) ? 1 : 0
        });
      }
    }

    let warnings = 0;
    for (const mv of moves) {
      const res = game.applyAction(state, mv, { ts: mv.ts });
      if (!res.ok) warnings++;
    }
    state.warnings = warnings;
    return { ok: true, state, warnings };
  }

  /** 导出为无损 JSON 记录 */
  function toJSONRecord(state) {
    return {
      format: 'bks-json',
      version: 1,
      exportedAt: new Date().toISOString(),
      game: game.toJSON(state)
    };
  }

  /** 从 JSON 记录还原（兼容包装格式与裸 GameState） */
  function fromJSONRecord(obj) {
    if (obj && obj.format === 'bks-json' && obj.game) return game.fromJSON(obj.game);
    if (obj && obj.game && obj.game.moves) return game.fromJSON(obj.game);
    return game.fromJSON(obj);
  }

  /** 生成可读摘要（历史列表用） */
  function summarize(state) {
    const s = state.result ? state.result.scores : null;
    return {
      id: state.id,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      status: state.status,
      mode: state.mode,
      seatCount: state.seatCount,
      players: state.players.map((p) => p.name),
      colors: state.players.map((p) => p.id),
      moves: state.moves.length,
      scores: s,
      ranking: state.result ? state.result.ranking : null
    };
  }

  const api = { LETTERS, colLetter, parsePos, pos, toText, parseText, toJSONRecord, fromJSONRecord, summarize };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

