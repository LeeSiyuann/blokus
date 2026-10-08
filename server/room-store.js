/* 私有房间快照：逐房校验、原子替换，损坏原文保留在 gitignore 的临时备份。 */
'use strict';
const fs = require('fs');
const path = require('path');
const game = require('../js/game');

// Windows 上文件替换可能被短暂占用；总等待上限 50ms，仍保持事务同步。
function replaceFile(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 5);
    }
  }
}

function snapshot(room) {
  return {
    id: room.id,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    seatCount: room.seatCount,
    hostSlot: room.hostSlot,
    phase: room.phase,
    lang: room.lang,
    slots: room.slots.map(s => ({...s})),
    state: room.state ? game.toJSON(room.state) : null
  };
}
function restore(raw, ttl) {
  if (!raw || !/^[A-Z0-9]{4}$/.test(raw.id) || !Number.isFinite(raw.createdAt) ||
      !Number.isFinite(raw.lastActivity) || ![2, 3, 4].includes(raw.seatCount) ||
      !['lobby', 'playing', 'finished'].includes(raw.phase) || !Array.isArray(raw.slots) ||
      !raw.slots.length || raw.slots.length > raw.seatCount ||
      raw.slots.some(
          s => !s || typeof s.name !== 'string' || s.name.length > 120 || typeof s.token !== 'string' ||
              !/^[a-f0-9]{24,128}$/.test(s.token)) ||
      new Set(raw.slots.map(s => s.token)).size !== raw.slots.length || !Number.isInteger(raw.hostSlot) ||
      !raw.slots[raw.hostSlot] || raw.slots[raw.hostSlot].left)
    throw Error('invalid_room');
  const room = {...raw, slots: raw.slots.map(s => ({...s})), clients: new Set()};
  room.state = raw.state ? game.fromJSON(raw.state) : null;
  if ((room.phase === 'lobby') !== !room.state ||
      (room.state &&
       (room.state.mode !== 'lan' || room.state.players.length !== room.slots.length ||
        room.state.status !== room.phase || room.state.rulesVersion !== game.RULES_VERSION)))
    throw Error('invalid_room');
  return Date.now() - room.lastActivity > ttl ? null : room;
}
class RoomStore {
  constructor(file) {
    this.file = file;
  }
  load(ttl) {
    if (!this.file || !fs.existsSync(this.file)) return [];
    const raw = fs.readFileSync(this.file, 'utf8');
    let rows;
    try {
      rows = JSON.parse(raw);
      if (!Array.isArray(rows)) throw Error();
    } catch (_) {
      fs.writeFileSync(this.file + '.invalid.tmp', raw);
      throw Error('storage_corrupt');
    }
    const rooms = [], ids = new Set();
    let invalid = 0;
    for (const row of rows) {
      try {
        const room = restore(row, ttl);
        if (room) {
          if (ids.has(room.id)) throw Error('duplicate_room');
          ids.add(room.id);
          rooms.push(room);
        }
      } catch (_) {
        invalid++;
      }
    }
    if (invalid) {
      fs.writeFileSync(this.file + '.invalid.tmp', raw);
      console.error('房间快照含 ' + invalid + ' 个损坏记录，已隔离并保留原文。');
    }
    return rooms;
  }
  save(rooms) {
    if (!this.file) return;
    const tmp = this.file + '.tmp';
    let fd;
    try {
      fs.mkdirSync(path.dirname(this.file), {recursive: true});
      fd = fs.openSync(tmp, 'w', 0o600);
      fs.writeFileSync(fd, JSON.stringify([...rooms.values()].map(snapshot)));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      replaceFile(tmp, this.file);
    } catch (error) {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch (_) {
        }
      }
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
      }
      if (error.code) console.error('房间快照保存失败：' + error.code);
      throw new Error('storage_failed', {cause: error});
    }
  }
}
module.exports = {
  RoomStore,
  snapshot
};
