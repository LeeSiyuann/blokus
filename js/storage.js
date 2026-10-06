/* storage.js — localStorage 持久化：设置 / 当前对局 / 历史索引 / 对局正文 */
(function (global) {
  'use strict';

  const K = {
    settings: 'blokus.settings.v1',
    current: 'blokus.current.v1',
    index: 'blokus.index.v1',
    game: (id) => 'blokus.game.' + id
  };
  const DEFAULT_SETTINGS = { lang: 'zh', sound: true, lastSeatCount: 4 };

  const hasLS = (() => {
    try { return typeof global.localStorage !== 'undefined' && global.localStorage !== null; }
    catch (e) { return false; }
  })();

  function read(key, fallback) {
    if (!hasLS) return fallback;
    try {
      const raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    if (!hasLS) return false;
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function remove(key) {
    if (!hasLS) return false;
    try { global.localStorage.removeItem(key); return true; }
    catch (e) { return false; }
  }

  function getSettings() {
    return Object.assign({}, DEFAULT_SETTINGS, read(K.settings, {}));
  }
  function setSettings(patch) {
    const next = Object.assign(getSettings(), patch || {});
    write(K.settings, next);
    return next;
  }

  function getIndex() {
    const list = read(K.index, []);
    return Array.isArray(list) ? list : [];
  }
  function setIndex(list) { return write(K.index, list); }

  function summarizeGame(g) {
    const scores = g.result ? g.result.scores : null;
    return {
      id: g.id,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      status: g.status,
      mode: g.mode,
      rulesVersion: g.rulesVersion || 1,
      seatCount: g.seatCount || (g.players ? g.players.length : 0),
      players: (g.players || []).map((p) => p.name),
      colors: (g.players || []).map((p) => p.id),
      moves: (g.moves || []).length,
      scores,
      ranking: g.result ? g.result.ranking : null
    };
  }

  /** 保存对局（record = { format:'bks-json', version:1, game: {...} }） */
  function saveRecord(record) {
    const g = record && record.game ? record.game : record;
    if (!g || !g.id) return { ok: false, code: 'bad_record' };
    const okWrite = write(K.game(g.id), record && record.game ? record : { format: 'bks-json', version: 1, game: g });
    if (!okWrite) return { ok: false, code: 'quota' };
    const list = getIndex().filter((s) => s.id !== g.id);
    list.push(summarizeGame(g));
    list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    const trimmed = list.slice(0, 200);
    setIndex(trimmed);
    if (g.status === 'playing' && g.mode !== 'lan') setCurrent(g.id);
    if (g.status === 'finished' && getCurrent() === g.id) setCurrent(null);
    return { ok: true, usage: usageBytes() };
  }

  function loadRecord(id) { return read(K.game(id), null); }

  function listGames(includeDeleted) {
    const list = getIndex();
    return (includeDeleted ? list : list.filter((s) => !s.deletedAt));
  }

  function deleteGame(id) {
    const list = getIndex().map((s) => (s.id === id ? Object.assign({}, s, { deletedAt: new Date().toISOString() }) : s));
    setIndex(list);
    remove(K.game(id));
    if (getCurrent() === id) setCurrent(null);
    return { ok: true };
  }

  function setCurrent(id) { if (id) return write(K.current, id); remove(K.current); return true; }
  function getCurrent() { return read(K.current, null); }

  function usageBytes() {
    if (!hasLS) return 0;
    let total = 0;
    try {
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.indexOf('blokus.') === 0) {
          total += key.length + (global.localStorage.getItem(key) || '').length;
        }
      }
    } catch (e) { return 0; }
    return total * 2;
  }

  const api = {
    K, getSettings, setSettings, saveRecord, loadRecord, listGames, deleteGame,
    setCurrent, getCurrent, usageBytes, hasLocalStorage: hasLS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

