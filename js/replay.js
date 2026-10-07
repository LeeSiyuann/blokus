/* replay.js — 回放播放器：步进 / 播放 / 跳转 / 速度 */
(function (global) {
  'use strict';

  const isNode = (typeof require === 'function' && typeof module !== 'undefined');
  const game = isNode ? require('./game.js') : (typeof window !== 'undefined' ? window.BK : global.BK);

  const BASE_INTERVAL = 900;

  class ReplayPlayer {
    /**
     * @param {object} source 棋谱记录（含 players / moves 的 GameState JSON）
     * @param {object} handlers { onUpdate(state, index, total, playing) }
     */
    constructor(source, handlers) {
      this.source = source;
      this.handlers = handlers || {};
      this.index = 0;
      this.total = (source.moves || []).length;
      this.playing = false;
      this.speed = 1;
      this.timer = null;
      this.state = null;
    }

    currentState() {
      if (!this.state || this._at !== this.index) {
        this.state = game.replayTo(this.source, this.index);
        this._at = this.index;
      }
      return this.state;
    }

    emit() {
      if (this.handlers.onUpdate) this.handlers.onUpdate(this.currentState(), this.index, this.total, this.playing);
    }

    seek(k) {
      const next = Math.max(0, Math.min(this.total, Math.round(k)));
      this.index = next;
      this.emit();
      return this.index;
    }
    next() { return this.seek(this.index + 1); }
    prev() { return this.seek(this.index - 1); }
    first() { this.pause(); return this.seek(0); }
    last() { this.pause(); return this.seek(this.total); }

    setSpeed(x) {
      const active = this.playing;
      if (active) this.pause();
      this.speed = Math.max(0.25, Math.min(8, x || 1));
      if (active) this.play();
      return this.speed;
    }

    play() {
      if (this.playing) return;
      if (this.index >= this.total) this.index = 0;
      this.playing = true;
      const step = () => {
        if (!this.playing) return;
        if (this.index >= this.total) { this.pause(); this.emit(); return; }
        this.next();
        this.timer = setTimeout(step, BASE_INTERVAL / this.speed);
      };
      this.emit();
      this.timer = setTimeout(step, BASE_INTERVAL / this.speed);
    }

    pause() {
      this.playing = false;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      this.emit();
    }

    toggle() { if (this.playing) this.pause(); else this.play(); }

    dispose() { this.pause(); this.handlers = {}; this.source = null; this.state = null; }
  }

  const api = { ReplayPlayer, BASE_INTERVAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

