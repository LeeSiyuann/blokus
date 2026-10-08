/* storage.js — 本地存档、回收站、备份；凭据不进入备份。 */
(function(global) {
'use strict';
const N = typeof module !== 'undefined' && module.exports ? require('./notation.js') : global.BK;
const K = {
  settings: 'blokus.settings.v1',
  current: 'blokus.current.v1',
  index: 'blokus.index.v1',
  connection: 'blokus.connection.v1',
  game: id => 'blokus.game.' + id
};
const MAX_GAMES = 200, MAX_BYTES = 4 * 1024 * 1024;
function ls() {
  try {
    return global.localStorage || null;
  } catch (_) {
    return null;
  }
}
function read(key, fallback) {
  try {
    const raw = ls().getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}
function snapshot() {
  const d = {}, s = ls();
  if (!s) throw new Error('storage_unavailable');
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k.startsWith('blokus.')) d[k] = s.getItem(k);
  }
  return d;
}
function bytes(d) {
  return Object.entries(d).reduce((n, [k, v]) => n + (k.length + v.length) * 2, 0);
}
function commit(d) {
  let before;
  const s = ls();
  try {
    before = snapshot();
    for (const k of Object.keys(before))
      if (!Object.hasOwn(d, k)) s.removeItem(k);
    for (const [k, v] of Object.entries(d))
      if (before[k] !== v) s.setItem(k, v);
    return {ok: true, usage: bytes(d)};
  } catch (_) {
    if (before) {
      try {
        for (const k of Object.keys(snapshot()))
          if (!Object.hasOwn(before, k)) s.removeItem(k);
        for (const [k, v] of Object.entries(before))
          if (s.getItem(k) !== v) s.setItem(k, v);
      } catch (_) {
        return {ok: false, code: 'storage_unavailable'};
      }
    }
    return {ok: false, code: s ? 'quota' : 'storage_unavailable'};
  }
}
function mutate(fn) {
  try {
    const d = snapshot();
    fn(d);
    return commit(d);
  } catch (e) {
    return {ok: false, code: e.message};
  }
}
function validSettings(v) {
  return {
    lang: v && v.lang === 'en' ? 'en' : 'zh',
    sound: !v || v.sound !== false,
    patternMode: !!(v && v.patternMode),
    lastSeatCount: v && [2, 3, 4].includes(v.lastSeatCount) ? v.lastSeatCount : 4
  };
}
function getSettings() {
  return validSettings(read(K.settings, {}));
}
function setSettings(p) {
  const v = validSettings(Object.assign(getSettings(), p)), r = mutate(d => {
                                                              d[K.settings] = JSON.stringify(v);
                                                            });
  return Object.assign(v, {saved: r.ok});
}
function getIndex() {
  const v = read(K.index, []);
  if (!Array.isArray(v)) return [];
  return v.flatMap(s => {
    if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)) return [];
    const valid = Array.isArray(s.players) && s.players.every(x => typeof x === 'string') &&
        Array.isArray(s.colors) && s.colors.length === s.players.length &&
        s.colors.every(x => ['blue','yellow','red','green'].includes(x)) &&
        s.seatCount === s.players.length && [2,3,4].includes(s.seatCount) &&
        ['hotseat','lan'].includes(s.mode) && ['playing','finished'].includes(s.status) &&
        Number.isInteger(s.moves) && s.moves >= 0 && s.moves <= 88 &&
        (s.rulesVersion === undefined || [1,2].includes(s.rulesVersion)) &&
        (s.scores == null || (typeof s.scores === 'object' && !Array.isArray(s.scores) &&
                             s.colors.every(x => Number.isFinite(s.scores[x]))));
    if (valid) return [s];
    try {
      const recovered = summarize(N.fromJSONRecord(loadRecord(s.id)));
      if (s.deletedAt && Number.isFinite(Date.parse(s.deletedAt))) recovered.deletedAt = s.deletedAt;
      return [recovered];
    } catch (_) { return []; }
  });
}
function summarize(g) {
  return Object.assign(N.summarize(g), {
    updatedAt: g.updatedAt,
    status: g.status,
    rulesVersion: g.rulesVersion === undefined ? 1 : g.rulesVersion
  });
}
function saveRecord(record) {
  let rec;
  try {
    rec = N.toJSONRecord(N.fromJSONRecord(record));
  } catch (_) {
    return {ok: false, code: 'bad_record'};
  }
  const g = rec.game;
  let evicted = 0;
  const res = mutate(d => {
    let list = getIndex().filter(s => s.id !== g.id);
    list.push(summarize(g));
    list.sort(
        (a, b) =>
            Number(b.updatedAt ?? Date.parse(b.createdAt)) - Number(a.updatedAt ?? Date.parse(a.createdAt)));
    d[K.game(g.id)] = JSON.stringify(rec);
    if (g.status === 'playing' && g.mode !== 'lan') d[K.current] = JSON.stringify(g.id);
    if ((g.status !== 'playing' || g.mode === 'lan') && getCurrent() === g.id) delete d[K.current];
    d[K.index] = JSON.stringify(list);
    for (const k of Object.keys(d))
      if (k.startsWith('blokus.game.') && !list.some(x => K.game(x.id) === k)) delete d[k];
    while (list.length > MAX_GAMES || bytes(d) > MAX_BYTES) {
      let at = -1;
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i].id !== g.id && (list[i].deletedAt || list[i].status === 'finished')) {
          at = i;
          break;
        }
      if (at < 0) throw new Error('quota');
      delete d[K.game(list[at].id)];
      list.splice(at, 1);
      evicted++;
      d[K.index] = JSON.stringify(list);
    }
  });
  return Object.assign(res, {evicted: res.ok ? evicted : 0});
}
function loadRecord(id) {
  return read(K.game(id), null);
}
function listGames(all) {
  return getIndex().filter(s => all || !s.deletedAt);
}
function deleteGame(id) {
  return mutate(d => {
    d[K.index] = JSON.stringify(
        getIndex().map(s => s.id === id ? Object.assign({}, s, {deletedAt: new Date().toISOString()}) : s));
    if (getCurrent() === id) delete d[K.current];
  });
}
function restoreGame(id) {
  return mutate(d => {
    d[K.index] = JSON.stringify(getIndex().map(s => {
      if (s.id !== id) return s;
      const v = Object.assign({}, s);
      delete v.deletedAt;
      return v;
    }));
  });
}
function setCurrent(id) {
  return mutate(d => {
           if (id)
             d[K.current] = JSON.stringify(id);
           else
             delete d[K.current];
         })
      .ok;
}
function getCurrent() {
  return read(K.current, null);
}
function usageBytes() {
  try {
    return bytes(snapshot());
  } catch (_) {
    return 0;
  }
}
function getConnection() {
  return read(K.connection, null);
}
function setConnection(v) {
  return mutate(d => {
    if (v)
      d[K.connection] = JSON.stringify(v);
    else
      delete d[K.connection];
  });
}
function exportBackup() {
  return {
    format: 'blokus-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    current: getCurrent(),
    records: listGames(true).map(s => ({record: loadRecord(s.id), deletedAt: s.deletedAt || null}))
  };
}
function importBackup(b) {
  if (!b || b.format !== 'blokus-backup' || b.version !== 1 || !Array.isArray(b.records) ||
      b.records.length > MAX_GAMES)
    return {ok: false, code: 'bad_record'};
  let entries;
  try {
    entries =
        b.records.map(e => ({record: N.toJSONRecord(N.fromJSONRecord(e.record)), deletedAt: e.deletedAt}));
    if (new Set(entries.map(e => e.record.game.id)).size !== entries.length ||
        entries.some(e => e.deletedAt && !Number.isFinite(Date.parse(e.deletedAt))))
      throw new Error('bad_record');
  } catch (_) {
    return {ok: false, code: 'bad_record'};
  }
  return mutate(d => {
    const list = getIndex();
    for (const e of entries) {
      const g = e.record.game, s = summarize(g);
      if (e.deletedAt) s.deletedAt = e.deletedAt;
      const at = list.findIndex(x => x.id === g.id);
      if (at >= 0)
        list[at] = s;
      else
        list.push(s);
      d[K.game(g.id)] = JSON.stringify(e.record);
    }
    list.sort((a,b)=>Number(b.updatedAt ?? Date.parse(b.createdAt))-Number(a.updatedAt ?? Date.parse(a.createdAt)));
    d[K.index] = JSON.stringify(list);
    d[K.settings] = JSON.stringify(validSettings(b.settings));
    const current =
        list.find(s => s.id === b.current && !s.deletedAt && s.status === 'playing' && s.mode !== 'lan');
    if (current) d[K.current] = JSON.stringify(current.id);
    else if (!list.some(s=>s.id===getCurrent() && !s.deletedAt && s.status==='playing' && s.mode!=='lan')) delete d[K.current];
    if (list.length > MAX_GAMES || bytes(d) > MAX_BYTES) throw new Error('quota');
  });
}
const api = {
  K,
  getSettings,
  setSettings,
  saveRecord,
  loadRecord,
  listGames,
  deleteGame,
  restoreGame,
  setCurrent,
  getCurrent,
  usageBytes,
  getConnection,
  setConnection,
  exportBackup,
  importBackup,
  hasLocalStorage: !!ls()
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.BK = global.BK || {};
Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);
