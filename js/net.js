/* net.js — 局域网客户端：REST 提交 + SSE 订阅（零依赖） */
(function (global) {
  'use strict';

  class NetClient {
    constructor(baseUrl) {
      this.base = (baseUrl || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, '');
      this.roomId = null;
      this.token = null;
      this.seat = null;
      this.playerId = null;
      this.es = null;
    }

    async request(method, path, body) {
      const res = await fetch(this.base + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      let data = {};
      try { data = await res.json(); } catch (e) { data = {}; }
      if (!res.ok || data.ok === false) {
        const err = new Error(data.error || ('HTTP ' + res.status));
        err.code = data.error || ('http_' + res.status);
        throw err;
      }
      return data;
    }

    async createRoom(opts) {
      const data = await this.request('POST', '/api/rooms', {
        name: opts.name, lang: opts.lang, seatCount: opts.seatCount
      });
      this.roomId = data.roomId; this.token = data.token; this.seat = data.seat;
      this.playerId = data.playerId;
      return data;
    }

    async joinRoom(opts) {
      const data = await this.request('POST', '/api/rooms/' + encodeURIComponent(opts.roomId) + '/join', {
        name: opts.name, token: opts.token
      });
      this.roomId = opts.roomId; this.token = data.token; this.seat = data.seat;
      this.playerId = data.playerId;
      return data;
    }

    async start() {
      return this.request('POST', '/api/rooms/' + encodeURIComponent(this.roomId) + '/start', { token: this.token });
    }

    async move(action) {
      return this.request('POST', '/api/rooms/' + encodeURIComponent(this.roomId) + '/move',
        Object.assign({ token: this.token }, action));
    }

    async pass() {
      return this.request('POST', '/api/rooms/' + encodeURIComponent(this.roomId) + '/pass', { token: this.token });
    }

    async record(format) {
      return this.request('GET', '/api/rooms/' + encodeURIComponent(this.roomId) + '/record?format=' +
        (format || 'json') + '&token=' + encodeURIComponent(this.token || ''));
    }

    /** 订阅房间事件；onEvent(type, payload) */
    connect(onEvent, onError) {
      this.disconnect();
      const url = this.base + '/api/rooms/' + encodeURIComponent(this.roomId) +
        '/stream?token=' + encodeURIComponent(this.token || '');
      if (typeof EventSource === 'undefined') return null;
      const es = new EventSource(url);
      const handle = (type) => (e) => {
        let payload = null;
        try { payload = JSON.parse(e.data); } catch (err) { payload = null; }
        if (onEvent) onEvent(type, payload);
      };
      es.addEventListener('state', handle('state'));
      es.addEventListener('presence', handle('presence'));
      es.addEventListener('end', handle('end'));
      es.onerror = (e) => { if (onError) onError(e); };
      this.es = es;
      return es;
    }

    disconnect() {
      if (this.es) { try { this.es.close(); } catch (e) { /* ignore */ } this.es = null; }
    }

    reset() { this.disconnect(); this.roomId = null; this.token = null; this.seat = null; this.playerId = null; }
  }

  const api = { NetClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

