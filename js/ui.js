/* ui.js — 界面总控：启动器 / 对局 / 历史 / 回放 / 联机 */
(function() {
'use strict';
const BKNS = window.BK;
const {t, setLang, applyI18n} = BKNS;

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const COLORS = BKNS.COLORS;
const PLAYER_ORDER = ['blue', 'yellow', 'red', 'green'];
const DEFAULT_NAMES_ZH = ['蓝方', '黄方', '红方', '绿方'];
const DEFAULT_NAMES_EN = ['Blue', 'Yellow', 'Red', 'Green'];

const app = {
  settings: {lang: 'zh', sound: true, lastSeatCount: 4},
  state: null,
  renderer: null,
  replayRenderer: null,
  replay: null,
  replaySource: null,
  selected: null,
  rot: 0,
  mirror: 0,
  hover: null,
  exportFmt: 'text',
  exportSource: null,
  net: null,
  lan: {roomId: null, token: null, seat: 0, hostSlot: 0, seats: [], phase: 'lobby', info: null},
  myTurnCache: false,
  replayState: null,
  trash: false,
  saveResult: null,
  connectionStatus: 'disconnected',
  lastEnd: null
};

const uiContext = {
  $,
  app,
  BKNS,
  t,
  renderBoard,
  renderReplayBoard,
  tryPlaceAt,
  errText,
  $$,
  setLang,
  applyI18n,
  toast,
  showView,
  colorOf,
  modeLabel,
  refreshLauncher,
  saveGame,
  renderGame,
  renderPlayersPanel,
  escapeHtml,
  asState,
  updateTopBar,
  PLAYER_ORDER,
  isFileProtocol,
  showGameOver,
  closeModal
};
const accessibility = BKNS.createAccessibilityUI(uiContext);
const recordsUI = BKNS.createRecordsUI({...uiContext, accessibility});
const lanUI = BKNS.createLanUI(uiContext);

/* ---------------- 基础工具 ---------------- */

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function showView(name) {
  const changed = document.body.dataset.view !== name;
  document.body.dataset.view = name;
  accessibility.showView(name, changed);
  if (name !== 'replay' && app.replay && app.replay.playing) app.replay.pause();
  if (name === 'game') setTimeout(() => renderBoard(), 30);
  if (name === 'replay') setTimeout(() => renderReplayBoard(), 30);
}

function errText(code) {
  const parts = String(code || 'network_error').split(':');
  if (parts[0] === 'invalid_move')
    return t('err.invalid_move', {n: parts[1]}) + (parts[2] ? ': ' + errText(parts[2]) : '');
  const value = t('err.' + parts[0]);
  return value.startsWith('err.') ? t('err.invalid_record') : value;
}
function colorOf(playerId) {
  return (COLORS[playerId] || COLORS.blue).fill;
}
function isFileProtocol() {
  return location.protocol === 'file:';
}

function modeLabel(source) {
  if (BKNS.recordRulesVersion(source) === 1) return t('mode.legacy');
  return source.seatCount === 4 ? t('mode.standard') : t('mode.simple', {n: source.seatCount});
}

function defaultNames() {
  const base = t('app.title') === 'BLOKUS' ? DEFAULT_NAMES_EN : DEFAULT_NAMES_ZH;
  return base.slice();
}

/* ---------------- 启动器 ---------------- */

function refreshLauncher() {
  $('#btnResumeLan').classList.toggle('hidden', isFileProtocol() || !savedConnection());
  $('#storageStatus').textContent = t('storage.usage', {n: (BKNS.usageBytes() / 1048576).toFixed(2)});
  const current = BKNS.getCurrent();
  const btn = $('#btnContinue');
  const desc = $('#continueDesc');
  if (current) {
    const rec = BKNS.loadRecord(current);
    if (rec && rec.game && rec.game.status === 'playing') {
      btn.disabled = false;
      const g = rec.game;
      desc.textContent = modeLabel(g) + ' · ' + g.players.map((p) => p.name).join(' / ') + ' · ' +
          (g.moves || []).length + ' ' + t('history.moves');
      return;
    }
  }
  btn.disabled = true;
  desc.textContent = t('launcher.noSave');
}

function pickLatestUnfinished() {
  const list = BKNS.listGames();
  for (const s of list) {
    if (s.status === 'playing' && s.mode !== 'lan') return s.id;
  }
  return null;
}

/* ---------------- 单机设置 ---------------- */

function buildNameInputs(seatCount) {
  $$('#seatSeg .seg-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.seats) === seatCount));
  const prior = new Map(
      $$('#nameList input')
          .map(
              (input) => [input.dataset.slot, {value: input.value, defaultName: input.dataset.defaultName}]));
  const wrap = $('#nameList');
  const names = defaultNames();
  const slots = BKNS.SEATS[seatCount] || BKNS.SEATS[4];
  wrap.innerHTML = '';
  slots.forEach((slot, i) => {
    const row = document.createElement('div');
    row.className = 'name-row';
    const dot = document.createElement('span');
    dot.className = 'name-dot';
    dot.style.background = colorOf(PLAYER_ORDER[slot]);
    dot.dataset.color = PLAYER_ORDER[slot];
    dot.textContent = {blue: 'B', yellow: 'Y', red: 'R', green: 'G'}[PLAYER_ORDER[slot]];
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    const old = prior.get(String(slot));
    input.value = old && old.value !== old.defaultName ? old.value : (names[slot] || ('P' + (i + 1)));
    input.dataset.defaultName = names[slot];
    input.dataset.slot = String(slot);
    input.setAttribute('aria-label', t('color.' + PLAYER_ORDER[slot]) + ' · ' + t('lan.name'));
    row.appendChild(dot);
    row.appendChild(input);
    wrap.appendChild(row);
  });
}

function selectedSeatCount() {
  const active = $('#seatSeg .seg-btn.active');
  return active ? parseInt(active.dataset.seats, 10) : 4;
}

/* ---------------- 对局状态 ---------------- */

function newHotseatGame(seatCount, names) {
  const slots = BKNS.SEATS[seatCount] || BKNS.SEATS[4];
  const players = slots.map(
      (slot, i) =>
          ({name: (names && names[i]) || defaultNames()[slot] || ('P' + (i + 1)), controller: 'human'}));
  return BKNS.createGame(
      {mode: 'hotseat', seatCount, players, lang: app.settings.lang, sound: app.settings.sound});
}

function saveGame() {
  if (!app.state) return {ok: false};
  const res = BKNS.saveRecord(BKNS.toJSONRecord(app.state));
  app.saveResult = res;
  $('#saveStatus').textContent = res.ok ? t('storage.saved') : t('storage.' + res.code);
  if (!res.ok)
    toast(t('storage.' + res.code));
  else if (res.evicted)
    toast(t('storage.evicted', {n: res.evicted}));
  return res;
}

function currentTurnInfo() {
  if (!app.state) return null;
  return BKNS.turnInfo(app.state);
}

function localSeatIndex() {
  if (!app.state) return 0;
  if (app.state.mode !== 'lan') return app.state.turn;
  return app.lan.seat;
}

function canLocalAct() {
  if (!app.state || app.state.status !== 'playing' || app.state.rulesVersion === 1) return false;
  if (app.state.mode !== 'lan') return true;
  return app.state.turn === app.lan.seat && app.connectionStatus === 'connected' && app.net &&
      !app.net.pending;
}

/* ---------------- 棋盘交互 ---------------- */

function renderBoard() {
  if (!app.renderer) return;
  if (!app.state) {
    app.renderer.setState(null);
    app.renderer.draw();
    return;
  }
  const preview = buildPreview();
  app.renderer.setState(
      app.state,
      {preview, patternMode: app.settings.patternMode, cursor: accessibility.cursor('boardCanvas')});
  app.renderer.draw();
  accessibility.updateBoard('boardCanvas', app.state, preview);
}

function buildPreview() {
  if (!app.selected || !app.hover || !app.state) return null;
  const cells = BKNS.cellsFor(app.selected, app.rot, app.mirror);
  if (!cells) return null;
  const abs = cells.map(([dr, dc]) => [app.hover.r + dr, app.hover.c + dc]);
  const res =
      BKNS.canPlace(app.state, app.state.turn, app.selected, app.rot, app.mirror, [app.hover.r, app.hover.c]);
  return {cells: abs, ok: res.ok, code: res.code};
}

function selectPiece(id) {
  app.selected = id;
  app.rot = 0;
  app.mirror = 0;
  BKNS.Sound.play('select');
  renderTray();
  renderBoard();
  $('#btnHint').disabled = !canLocalAct();
}

function rotateSelected() {
  if (!app.selected) return;
  app.rot = (app.rot + 90) % 360;
  BKNS.Sound.play('rotate');
  renderTray();
  renderBoard();
}

function flipSelected() {
  if (!app.selected) return;
  app.mirror = app.mirror ? 0 : 1;
  BKNS.Sound.play('rotate');
  renderTray();
  renderBoard();
}

function tryPlaceAt(r, c) {
  if (!app.state) return;
  if (!canLocalAct()) {
    toast(t('game.waiting'));
    return;
  }
  if (!app.selected) {
    toast(t('game.noSelection'));
    return;
  }
  const res = BKNS.canPlace(app.state, app.state.turn, app.selected, app.rot, app.mirror, [r, c]);
  if (!res.ok) {
    BKNS.Sound.play('invalid');
    toast(errText(res.code));
    return;
  }
  if (app.state.mode === 'lan') {
    app.net.move({type: 'place', piece: app.selected, anchor: [r, c], rot: app.rot, mirror: app.mirror})
        .catch((e) => {
          BKNS.Sound.play('invalid');
          toast(t('toast.lanError') + ': ' + errText(e.code));
        })
        .finally(() => renderGame());
    return;
  }
  const okRes = BKNS.applyAction(
      app.state, {type: 'place', piece: app.selected, anchor: [r, c], rot: app.rot, mirror: app.mirror});
  if (!okRes.ok) {
    BKNS.Sound.play('invalid');
    toast(errText(okRes.code));
    return;
  }
  BKNS.Sound.play('place');
  app.selected = null;
  app.hover = null;
  afterMove();
}

function afterMove() {
  saveGame();
  renderGame();
  if (app.state.status === 'finished') {
    BKNS.Sound.play('win');
    showGameOver();
  }
}

function doPass() {
  if (!app.state || !canLocalAct()) return;
  const info = currentTurnInfo();
  if (!info.mustPass) {
    BKNS.Sound.play('invalid');
    toast(t('err.has_moves'));
    return;
  }
  if (app.state.mode === 'lan') {
    app.net.pass()
        .catch((e) => toast(t('toast.lanError') + ': ' + errText(e.code)))
        .finally(() => renderGame());
    return;
  }
  const res = BKNS.applyAction(app.state, {type: 'pass'});
  if (!res.ok) {
    toast(errText(res.code));
    return;
  }
  BKNS.Sound.play('pass');
  toast(t('game.passDone'));
  app.selected = null;
  afterMove();
}

function doUndo() {
  if (!app.state || app.state.mode === 'lan' || app.state.rulesVersion === 1) return;
  const res = BKNS.undo(app.state);
  if (!res.ok) {
    toast(errText(res.code));
    return;
  }
  BKNS.Sound.play('click');
  app.selected = null;
  saveGame();
  renderGame();
}

function renderGame() {
  if (!app.state) return;
  const s = app.state;
  $('#gameMode').textContent = modeLabel(s);
  const turnIdx = s.status === 'finished' ? null : s.turn;
  const banner = $('#turnBanner');
  if (s.status === 'finished') {
    banner.innerHTML = '<b>' + t('game.gameOver') + '</b>';
  } else {
    const p = s.players[turnIdx];
    const info = BKNS.turnInfo(s);
    const who = (s.mode === 'lan') ? (turnIdx === app.lan.seat ? t('game.yourTurn') : p.name) : p.name;
    banner.innerHTML = '<span style="color:' + colorOf(p.id) + '">●</span> ' + t('game.turn') + ': <b>' +
        escapeHtml(who) + '</b>' +
        '<small>' + (info.mustPass ? t('game.mustPass') : t('game.hintSelect')) + '</small>';
  }
  renderPlayersPanel($('#playersPanel'), s);
  renderTray();

  const my = canLocalAct();
  $('#btnPass').disabled = !my || !(s.status === 'playing' && currentTurnInfo().mustPass);
  $('#btnPass').classList.toggle('primary', !$('#btnPass').disabled);
  $('#saveStatus').textContent =
      app.saveResult ? (app.saveResult.ok ? t('storage.saved') : t('storage.' + app.saveResult.code)) : '';
  $('#netStatus').classList.toggle('hidden', s.mode !== 'lan');
  $('#btnUndo').disabled = s.mode === 'lan' || !s.moves.length || s.status === 'finished';
  $('#btnPlace').disabled = !my;
  $('#btnHint').disabled = !my || !app.selected;
  $('#btnRotate').disabled = !my || !app.selected;
  $('#btnFlip').disabled = !my || !app.selected;
  $('#btnExport').disabled = false;

  const passBtn = $('#btnPass');
  if (passBtn.textContent.trim() !== t('game.pass')) passBtn.textContent = t('game.pass');
  renderBoard();
}

function renderPlayersPanel(host, s) {
  host.innerHTML = '';
  s.players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + ((i === s.turn && s.status === 'playing') ? ' active' : '') +
        (p.passed ? ' passed' : '');
    const sw = document.createElement('span');
    sw.className = 'player-swatch';
    sw.style.background = colorOf(p.id);
    sw.dataset.color = p.id;
    sw.textContent = {blue: 'B', yellow: 'Y', red: 'R', green: 'G'}[p.id];
    sw.setAttribute('aria-label', t('color.' + p.id));
    const name = document.createElement('span');
    name.className = 'player-name';
    const isMe = s.mode === 'lan' && i === app.lan.seat;
    name.textContent = p.name + (isMe ? ' ★' : '');
    const stat = document.createElement('span');
    stat.className = 'player-stat';
    const rem = (s.remaining[i] || []).length;
    const score = s.status === 'finished' ? s.result.scores[p.id] : BKNS.scoreFor(s, i);
    stat.textContent = rem + ' ' + t('game.remaining') + ' · ' + score +
        (s.mode === 'lan' && app.lan.seats[i] ?
             ' · ' + t(app.lan.seats[i].online ? 'lan.online' : 'lan.offline') :
             '');
    chip.appendChild(sw);
    chip.appendChild(name);
    chip.appendChild(stat);
    if (s.mode === 'lan' && app.lan.seats[i] && app.lan.seats[i].left) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = t('lan.left');
      chip.appendChild(b);
    }
    if (p.passed) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = t('game.pass');
      chip.appendChild(b);
    }
    if (s.mode === 'lan' && app.lan.hostSlot === app.lan.seat && i !== app.lan.seat && app.net &&
        app.lan.seats[i] && !app.lan.seats[i].left) {
      const kick = document.createElement('button');
      kick.className = 'btn ghost';
      kick.textContent = t('lan.kick');
      kick.addEventListener('click', () => app.net.kick(i).catch((e) => toast(errText(e.code))));
      chip.appendChild(kick);
    }
    host.appendChild(chip);
  });
}

function renderTray() {
  const host = $('#tray');
  const focusedPiece = host.contains(document.activeElement) ? document.activeElement.dataset.piece : null;
  if (!app.state) return;
  const s = app.state;
  let seatIdx;
  if (s.mode === 'lan')
    seatIdx = app.lan.seat;
  else
    seatIdx = s.status === 'finished' ? 0 : s.turn;
  const colorId = s.players[seatIdx].id;
  const remaining = s.remaining[seatIdx] || [];
  host.innerHTML = '';
  if (!remaining.length) {
    const e = document.createElement('div');
    e.className = 'tray-empty';
    e.textContent = t('game.gameOver');
    host.appendChild(e);
    return;
  }
  for (const id of remaining) {
    const btn = document.createElement('button');
    btn.className = 'tray-piece' + (app.selected === id ? ' selected' : '');
    btn.dataset.piece = id;
    btn.setAttribute('aria-label', t('access.piece', {id, n: BKNS.PIECES[id].size}));
    btn.setAttribute('aria-pressed', String(app.selected === id));
    btn.disabled = !canLocalAct();
    const canvas = document.createElement('canvas');
    const label = document.createElement('span');
    label.textContent = id;
    btn.appendChild(canvas);
    btn.appendChild(label);
    btn.addEventListener('click', () => selectPiece(id));
    host.appendChild(btn);
    requestAnimationFrame(
        () => BKNS.drawPieceThumb(
            canvas, id, colorId, app.selected === id ? app.rot : 0, app.selected === id ? app.mirror : 0));
  }
  if (focusedPiece) host.querySelector('[data-piece="' + focusedPiece + '"]')?.focus({preventScroll: true});
}

function showGameOver() {
  const s = app.state;
  const res = s.result;
  const rows =
      s.players
          .map((p) => ({id: p.id, name: p.name, score: res.scores[p.id], rem: res.remainingSquares[p.id]}))
          .sort((a, b) => b.score - a.score);
  $('#overBody').innerHTML = '<div class="players-panel">' +
      rows.map(
              (r, i) =>
                  ('<div class="player-chip"><span class="player-swatch" style="background:' + colorOf(r.id) +
                   '"></span>' +
                   '<span class="player-name">' + (rows.findIndex((x) => x.score === r.score) + 1) + '. ' +
                   escapeHtml(r.name) + '</span>' +
                   '<span class="player-stat">' + r.score + ' (' + r.rem + ' ' + t('game.squares') +
                   ')</span></div>'))
          .join('') +
      '</div>';
  $('#btnOverAgain').disabled = s.mode === 'lan' && app.lan.hostSlot !== app.lan.seat;
  $('#btnOverAgain').textContent =
      s.mode === 'lan' && app.lan.hostSlot !== app.lan.seat ? t('lan.restartWait') : t('game.playAgain');
  openModal('overModal');
}

function escapeHtml(s) {
  return String(s).replace(
      /[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[ch]));
}

/** 统一转成内部 state（Int8Array 棋盘）；普通棋谱 JSON 会先还原 */
function asState(src) {
  if (!src) return null;
  if (src.board instanceof Int8Array) return src;
  try {
    return BKNS.fromJSON(src);
  } catch (e) {
    return null;
  }
}

function openModal(...args) {
  return recordsUI.openModal(...args);
}
function closeModal(...args) {
  return recordsUI.closeModal(...args);
}
function exportContent(...args) {
  return recordsUI.exportContent(...args);
}
function openExport(...args) {
  return recordsUI.openExport(...args);
}
function download(...args) {
  return recordsUI.download(...args);
}
function copyText(...args) {
  return recordsUI.copyText(...args);
}
function importFromText(...args) {
  return recordsUI.importFromText(...args);
}
function handleImported(...args) {
  return recordsUI.handleImported(...args);
}
function renderHistory(...args) {
  return recordsUI.renderHistory(...args);
}
function openRecord(...args) {
  return recordsUI.openRecord(...args);
}
function openReplay(...args) {
  return recordsUI.openReplay(...args);
}
function buildReplayInfo(...args) {
  return recordsUI.buildReplayInfo(...args);
}
function renderReplayBoard(...args) {
  return recordsUI.renderReplayBoard(...args);
}

function savedConnection(...args) {
  return lanUI.savedConnection(...args);
}
function persistConnection(...args) {
  return lanUI.persistConnection(...args);
}
function clearConnection(...args) {
  return lanUI.clearConnection(...args);
}
function lobbyLink(...args) {
  return lanUI.lobbyLink(...args);
}
function connectionStatus(...args) {
  return lanUI.connectionStatus(...args);
}
function applyLanPayload(...args) {
  return lanUI.applyLanPayload(...args);
}
function renderLobby(...args) {
  return lanUI.renderLobby(...args);
}
function createRoom(...args) {
  return lanUI.createRoom(...args);
}
function joinRoom(...args) {
  return lanUI.joinRoom(...args);
}
function resumeConnection(...args) {
  return lanUI.resumeConnection(...args);
}
function connectRoom(...args) {
  return lanUI.connectRoom(...args);
}
function startLanGame(...args) {
  return lanUI.startLanGame(...args);
}
function leaveRoom(...args) {
  return lanUI.leaveRoom(...args);
}

/* ---------------- 事件绑定 ---------------- */

function bindEvents() {
  accessibility.bind();
  $('#patternToggle').addEventListener('click', () => {
    app.settings = BKNS.setSettings({patternMode: !app.settings.patternMode});
    if (!app.settings.saved) toast(t('storage.storage_unavailable'));
    updateTopBar();
    renderBoard();
    renderReplayBoard();
  });
  $('#btnHint').addEventListener('click', () => {
    if (!app.selected || !canLocalAct()) return;
    const placements = BKNS.legalPlacements(app.state, app.state.turn, app.selected);
    if (!placements.length) {
      toast(t('access.noHint'));
      return;
    }
    const key = app.state.id + ':' + app.state.moves.length + ':' + app.selected;
    const i = app.hintKey === key ? (app.hintIndex + 1) % placements.length : 0;
    app.hintKey = key;
    app.hintIndex = i;
    const move = placements[i];
    app.rot = move.rot;
    app.mirror = move.mirror;
    renderTray();
    accessibility.previewAt({r: move.anchor[0], c: move.anchor[1]});
  });
  $('#langToggle').addEventListener('click', () => {
    const next = app.settings.lang === 'zh' ? 'en' : 'zh';
    app.settings = BKNS.setSettings({lang: next});
    if (!app.settings.saved) toast(t('storage.storage_unavailable'));
    setLang(next);
    applyI18n();
    document.title = t('app.title');
    updateTopBar();
    if (document.body.dataset.view === 'replay' && app.replay)
      app.replay.emit();
    else if (document.body.dataset.view === 'game' && app.state)
      renderGame();
    if (document.body.dataset.view === 'history') renderHistory();
    if (document.body.dataset.view === 'lobby') renderLobby();
    refreshLauncher();
    buildNameInputs(selectedSeatCount());
    if (!$('#overModal').classList.contains('hidden') && app.state) showGameOver();
  });
  $('#soundToggle').addEventListener('click', () => {
    const next = !BKNS.Sound.isEnabled();
    BKNS.Sound.setEnabled(next);
    app.settings = BKNS.setSettings({sound: next});
    if (!app.settings.saved) toast(t('storage.storage_unavailable'));
    updateTopBar();
    if (next) BKNS.Sound.play('click');
  });

  $('#btnSingle').addEventListener('click', () => {
    buildNameInputs(app.settings.lastSeatCount || 4);
    showView('setup');
  });
  $('#btnLan').addEventListener('click', () => {
    $('#lanPanel').classList.toggle('hidden');
    if (isFileProtocol()) toast(t('lan.needServer'));
  });
  $('#btnContinue').addEventListener('click', () => {
    let id = BKNS.getCurrent();
    if (!id) id = pickLatestUnfinished();
    if (!id) {
      toast(t('launcher.noSave'));
      return;
    }
    const rec = BKNS.loadRecord(id);
    if (!rec || !rec.game) {
      toast(t('launcher.noSave'));
      return;
    }
    openRecord(id);
  });
  $('#btnHistory').addEventListener('click', () => {
    renderHistory();
    showView('history');
  });
  $('#btnImport').addEventListener('click', () => {
    openModal('importModal');
  });

  $('#seatSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    $$('#seatSeg .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    const seats = parseInt(btn.dataset.seats, 10);
    app.settings = BKNS.setSettings({lastSeatCount: seats});
    buildNameInputs(seats);
  });
  $('#btnSetupBack').addEventListener('click', () => showView('launcher'));
  $('#btnSetupStart').addEventListener('click', () => {
    const seats = selectedSeatCount();
    const names = $$('#nameList input').map((i) => i.value.trim());
    app.state = newHotseatGame(seats, names);
    app.selected = null;
    showView('game');
    renderGame();
    saveGame();
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.body.dataset.view !== 'game' || e.target.closest('input,textarea,select') ||
        document.querySelector('.modal:not(.hidden)'))
      return;
    const k = e.key.toLowerCase();
    if ((k === 'enter' || k === ' ') && e.target.closest('button,[role=grid]')) return;
    if (['r', 'f', 'escape', 'enter', ' ', 'p'].includes(k)) e.preventDefault();
    if (k === 'r') {
      rotateSelected();
    } else if (k === 'f') {
      flipSelected();
    } else if (k === 'escape') {
      app.selected = null;
      renderTray();
      renderBoard();
    } else if (k === 'enter' || k === ' ') {
      if (app.hover) tryPlaceAt(app.hover.r, app.hover.c);
    } else if (k === 'p') {
      doPass();
    }
  });

  $('#btnRotate').addEventListener('click', rotateSelected);
  $('#btnFlip').addEventListener('click', flipSelected);
  $('#btnPlace').addEventListener('click', () => {
    if (app.hover)
      tryPlaceAt(app.hover.r, app.hover.c);
    else
      toast(t('game.noSelection'));
  });
  $('#btnPass').addEventListener('click', doPass);
  $('#btnUndo').addEventListener('click', doUndo);
  $('#btnExport').addEventListener('click', () => openExport(app.state));
  $('#btnExitGame').addEventListener('click', () => {
    if (app.state && app.state.mode === 'lan') {
      leaveRoom();
      return;
    }
    if (app.state) saveGame();
    refreshLauncher();
    showView('launcher');
  });

  $('#btnHistoryBack').addEventListener('click', () => {
    refreshLauncher();
    showView('launcher');
  });
  $('#btnReplayBack').addEventListener('click', () => showView('history'));
  $('#btnReplayExport').addEventListener('click', () => openExport(app.replaySource));
  $('#btnFirst').addEventListener('click', () => app.replay && app.replay.first());
  $('#btnPrev').addEventListener('click', () => app.replay && app.replay.prev());
  $('#btnNext').addEventListener('click', () => app.replay && app.replay.next());
  $('#btnLast').addEventListener('click', () => app.replay && app.replay.last());
  $('#btnPlay').addEventListener('click', () => app.replay && app.replay.toggle());
  $('#replaySlider').addEventListener('input', (e) => {
    if (app.replay) {
      app.replay.pause();
      app.replay.seek(parseInt(e.target.value, 10));
    }
  });
  $('#speedSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    $$('#speedSeg .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    if (app.replay) app.replay.setSpeed(parseFloat(btn.dataset.speed));
  });

  $('#btnCreateRoom').addEventListener('click', createRoom);
  $('#btnJoinRoom').addEventListener('click', joinRoom);
  $('#btnCopyLink').addEventListener('click', () => copyText(lobbyLink(app.lan.roomId)));
  $('#lanAddress').addEventListener('input', renderLobby);
  $('#btnResumeLan').addEventListener('click', resumeConnection);
  $('#btnBackup')
      .addEventListener(
          'click', () => download('blokus-backup.json', JSON.stringify(BKNS.exportBackup(), null, 2)));
  $('#btnTrash').addEventListener('click', () => {
    app.trash = !app.trash;
    $('#btnTrash').setAttribute('aria-pressed', String(app.trash));
    renderHistory();
  });
  $('#btnLobbyStart').addEventListener('click', startLanGame);
  $('#btnLobbyLeave').addEventListener('click', leaveRoom);

  $$('.modal-close').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(m.id);
  }));

  $('#exportSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    app.exportFmt = btn.dataset.fmt;
    $$('#exportSeg .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $('#exportText').value = exportContent();
  });
  $('#btnCopyExport').addEventListener('click', () => copyText($('#exportText').value));
  $('#btnDownloadExport').addEventListener('click', () => {
    const id = (app.exportSource || app.state || {}).id || 'blokus';
    const ext = app.exportFmt === 'json' ? 'json' : 'bks.txt';
    download(id + '.' + ext, $('#exportText').value);
  });
  $('#btnDoImport').addEventListener('click', () => handleImported(importFromText($('#importText').value)));
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      toast(errText('too_large'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      $('#importText').value = String(reader.result || '');
    };
    reader.readAsText(f);
  });

  $('#btnOverExport').addEventListener('click', () => {
    closeModal('overModal');
    openExport(app.state);
  });
  $('#btnOverAgain').addEventListener('click', async () => {
    if (app.state && app.state.mode === 'lan') {
      try {
        await app.net.restart();
        closeModal('overModal');
      } catch (e) {
        toast(errText(e.code));
      }
      return;
    }
    closeModal('overModal');
    const names = app.state ? app.state.players.map((p) => p.name) : null;
    const seats = app.state ? app.state.seatCount : 4;
    app.state = newHotseatGame(seats, names);
    app.selected = null;
    showView('game');
    renderGame();
    saveGame();
  });
  $('#btnOverBack').addEventListener('click', async () => {
    if (app.state && app.state.mode === 'lan') {
      await leaveRoom();
      return;
    }
    closeModal('overModal');
    refreshLauncher();
    showView('launcher');
  });

  window.addEventListener('resize', () => {
    renderBoard();
    renderReplayBoard();
  });
}

function updateTopBar() {
  $('#patternToggle').textContent = t('access.pattern');
  $('#patternToggle').setAttribute('aria-pressed', String(!!app.settings.patternMode));
  $('#soundToggle').textContent = BKNS.Sound.isEnabled() ? '🔊' : '🔇';
  $('#soundToggle').setAttribute('aria-pressed', String(BKNS.Sound.isEnabled()));
  $('#soundToggle').setAttribute('aria-label', t(BKNS.Sound.isEnabled() ? 'sound.on' : 'sound.off'));
  $('#soundToggle').title = t(BKNS.Sound.isEnabled() ? 'sound.on' : 'sound.off');
  $('#langToggle').textContent = app.settings.lang === 'zh' ? '中文 / EN' : 'EN / 中文';
}

/* ---------------- 启动 ---------------- */

function init() {
  app.settings = BKNS.getSettings();
  setLang(app.settings.lang);
  BKNS.Sound.setEnabled(app.settings.sound !== false);
  applyI18n();
  document.title = t('app.title');
  updateTopBar();

  app.renderer = new BKNS.Renderer($('#boardCanvas'));
  app.replayRenderer = new BKNS.Renderer($('#replayCanvas'));

  if (isFileProtocol()) {
    $('#fileHint').classList.remove('hidden');
    $('#btnLan').disabled = true;
  }

  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    $('#lanRoomCode').value = room.toUpperCase();
    $('#lanPanel').classList.remove('hidden');
  }

  bindEvents();
  buildNameInputs(app.settings.lastSeatCount || 4);
  refreshLauncher();
  showView('launcher');
  if (!isFileProtocol() && savedConnection() &&
      (!room || (savedConnection(true) && savedConnection(true).roomId === room)))
    resumeConnection();

  const first = document.body;
  first.addEventListener('pointerdown', () => BKNS.Sound.unlock(), {once: true});
}

document.addEventListener('DOMContentLoaded', init);
})();
