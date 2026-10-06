/* sound.js — WebAudio 合成音效（默认开启，无音频文件依赖） */
(function (global) {
  'use strict';

  let ctx = null;
  let enabled = true;

  function ensure() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }

  function tone(freq, dur, type, gain, delay) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    const peak = gain === undefined ? 0.08 : gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  const PATTERNS = {
    select: () => tone(660, 0.06, 'sine', 0.05),
    rotate: () => tone(520, 0.05, 'triangle', 0.04),
    place: () => { tone(440, 0.09, 'triangle', 0.09); tone(660, 0.10, 'triangle', 0.06, 0.06); },
    invalid: () => { tone(180, 0.16, 'sawtooth', 0.06); tone(140, 0.18, 'sawtooth', 0.05, 0.09); },
    pass: () => tone(320, 0.14, 'sine', 0.05),
    win: () => { tone(523, 0.12, 'triangle', 0.08); tone(659, 0.12, 'triangle', 0.08, 0.10); tone(784, 0.20, 'triangle', 0.09, 0.20); },
    join: () => { tone(392, 0.08, 'sine', 0.05); tone(523, 0.10, 'sine', 0.05, 0.07); },
    click: () => tone(600, 0.04, 'square', 0.03)
  };

  function play(name) {
    if (!enabled) return;
    const fn = PATTERNS[name];
    if (fn) { try { fn(); } catch (e) { /* ignore */ } }
  }

  function setEnabled(v) { enabled = !!v; if (enabled) ensure(); }
  function isEnabled() { return enabled; }

  const api = { play, setEnabled, isEnabled, unlock: ensure, _patterns: PATTERNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
  global.BK.Sound = api;
})(typeof window !== 'undefined' ? window : globalThis);

