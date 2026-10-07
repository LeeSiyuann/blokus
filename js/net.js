/* net.js — REST + SSE，动作校验版本、连接状态与同房生命周期。 */
(function(global) {
'use strict';
class NetClient {
  constructor(base) {
    this.base = (base || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, '');
    this.roomId = null;
    this.token = null;
    this.seat = null;
    this.es = null;
    this.state = null;
    this.pending = false;
  }
  async request(method, path, body) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: body ? {'Content-Type': 'application/json'} : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: abort.signal
      });
      let d;
      try {
        d = await res.json();
      } catch (_) {
        d = {};
      }
      if (!res.ok || d.ok === false) {
        const e = new Error(d.error || 'network_error');
        e.code = d.error || 'network_error';
        throw e;
      }
      return d;
    } catch (e) {
      if (!e.code) e.code = 'network_error';
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  async createRoom(o) {
    return this.adopt(await this.request('POST', '/api/rooms', o));
  }
  async joinRoom(o) {
    return this.adopt(await this.request(
        'POST', '/api/rooms/' + encodeURIComponent(o.roomId) + '/join', {name: o.name, token: o.token}));
  }
  adopt(d) {
    Object.assign(this, {roomId: d.roomId, token: d.token, seat: d.seat});
    return d;
  }
  post(action, body) {
    return this.request(
        'POST', '/api/rooms/' + encodeURIComponent(this.roomId) + '/' + action,
        Object.assign({token: this.token}, body));
  }
  start() {
    return this.post('start');
  }
  restart() {
    return this.post('restart');
  }
  leave() {
    return this.post('leave');
  }
  kick(seat) {
    return this.post('kick', {seat});
  }
  async submit(type, body) {
    if (this.pending) return;
    this.pending = true;
    try {
      return await this.post(
          type,
          Object.assign(
              {gameId: this.state && this.state.id, expectedMoves: this.state && this.state.moves.length},
              body));
    } finally {
      this.pending = false;
    }
  }
  move(action) {
    return this.submit('move', action);
  }
  pass() {
    return this.submit('pass');
  }
  record() {
    return this.request(
        'GET',
        '/api/rooms/' + encodeURIComponent(this.roomId) + '/record?token=' + encodeURIComponent(this.token));
  }
  connect(onEvent, onStatus) {
    this.disconnect();
    if (typeof EventSource === 'undefined') throw new Error('network_error');
    this.es = new EventSource(
        this.base + '/api/rooms/' + encodeURIComponent(this.roomId) +
        '/stream?token=' + encodeURIComponent(this.token));
    this.es.onopen = () => onStatus && onStatus('connected');
    this.es.onerror = () => onStatus && onStatus('reconnecting');
    for (const type of ['state', 'removed'])
      this.es.addEventListener(type, e => {
        try {
          const d = JSON.parse(e.data);
          if (d.state) this.state = d.state;
          if (d.self !== undefined) this.seat = d.self;
          onEvent(type, d);
        } catch (err) {
          if (onStatus) onStatus('disconnected');
        }
      });
    return this.es;
  }
  disconnect() {
    if (this.es) this.es.close();
    this.es = null;
  }
  reset() {
    this.disconnect();
    this.roomId = null;
    this.token = null;
    this.seat = null;
    this.state = null;
  }
}
const api = {NetClient};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.BK = global.BK || {};
Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);
