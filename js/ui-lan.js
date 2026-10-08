/* ui-lan.js — 联机生命周期控制器；通过 ctx 显式注入协调器依赖。 */
(function(global) {
'use strict';
function createLanUI(ctx) {
  const {
    $,
    app,
    BKNS,
    t,
    PLAYER_ORDER,
    toast,
    showView,
    errText,
    colorOf,
    isFileProtocol,
    refreshLauncher,
    saveGame,
    renderGame,
    showGameOver,
    closeModal
  } = ctx;
  let joining = false;
  function setJoining(value) {
    joining = value;
    for (const id of ['btnCreateRoom','btnJoinRoom','btnResumeLan']) $('#' + id).disabled = value;
  }
  /* ---------------- 联机 ---------------- */

  function savedConnection(tabOnly) {
    try {
      const raw = sessionStorage.getItem('blokus.connection');
      if (raw) return JSON.parse(raw);
    } catch (_) {
    }
    return tabOnly ? null : BKNS.getConnection();
  }
  function persistConnection() {
    const value = {roomId: app.net.roomId, token: app.net.token, base: app.net.base};
    try {
      sessionStorage.setItem('blokus.connection', JSON.stringify(value));
    } catch (_) {
    }
    const res = BKNS.setConnection(value);
    if (!res.ok) toast(t('storage.' + res.code));
  }
  function clearConnection() {
    try {
      sessionStorage.removeItem('blokus.connection');
    } catch (_) {
    }
    BKNS.setConnection(null);
  }
  function lobbyLink(roomId) {
    try {
      const url = new URL($('#lanAddress').value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        return '';
      return url.origin + '/?room=' + encodeURIComponent(roomId);
    } catch (_) {
      return '';
    }
  }
  function connectionStatus(status) {
    app.connectionStatus = status;
    $('#netStatus').textContent = t('game.' + (status === 'connected' ? 'connected' : 'disconnected')) +
        (status === 'reconnecting' ? ' · ' + t('lan.reconnecting') : '');
    if (document.body.dataset.view === 'game' && app.state) renderGame();
  }
  function applyLanPayload(payload) {
    if (!payload) return;
    if (payload.self !== undefined) {
      if (payload.self < 0) return;
      app.lan.seat = payload.self;
    }
    const previous = app.state;
    app.lan.phase = payload.phase;
    app.lan.seats = payload.seats || [];
    app.lan.hostSlot = payload.hostSlot;
    app.lan.roomId = payload.roomId;
    app.lan.totalSeats = payload.totalSeats;
    if (payload.shareUrls && payload.shareUrls.length && !$('#lanAddress').value)
      $('#lanAddress').value = payload.shareUrls[0];
    if (payload.phase === 'lobby') {
      renderLobby();
      showView('lobby');
      return;
    }
    if (payload.state) {
      app.state = BKNS.fromJSON(payload.state);
      app.state.server = {roomId: app.lan.roomId, seat: app.lan.seat};
      const changed =
          !previous || previous.id !== app.state.id || previous.moves.length !== app.state.moves.length;
      if (changed) {
        app.selected = null;
        app.hover = null;
      }
      if (previous && previous.id === app.state.id && app.state.moves.length > previous.moves.length) {
        const last = app.state.moves.at(-1);
        BKNS.Sound.play(last.type === 'place' ? 'place' : 'pass');
      }
      showView('game');
      renderGame();
      saveGame();
      if (app.state.status === 'finished') {
        if (app.lastEnd !== app.state.id) {
          app.lastEnd = app.state.id;
          BKNS.Sound.play('win');
          showGameOver();
        }
      } else {
        closeModal('overModal');
        app.lastEnd = null;
      }
    }
  }
  function renderLobby() {
    $('#lobbyCode').textContent = app.lan.roomId || '----';
    $('#lobbyLink').textContent = lobbyLink(app.lan.roomId) || t('lan.noAddress');
    $('#btnCopyLink').disabled = !lobbyLink(app.lan.roomId);
    const host = $('#lobbyPlayers');
    host.innerHTML = '';
    const total = app.lan.totalSeats || 4;
    $('#lobbyMode').textContent = t('mode.hint');
    const seatMap = BKNS.SEATS[total];
    for (let i = 0; i < total; i++) {
      const seat = app.lan.seats.find((s) => s.slot === i), chip = document.createElement('div');
      chip.className = 'player-chip';
      const sw = document.createElement('span');
      sw.className = 'player-swatch';
      sw.style.background = colorOf(PLAYER_ORDER[seatMap[i]]);
      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = seat ? seat.name : '—';
      const stat = document.createElement('span');
      stat.className = 'player-stat';
      stat.textContent = seat ? (i === app.lan.hostSlot ? t('lan.host') + ' · ' : '') +
              t(seat.online ? 'lan.online' : 'lan.offline') :
                                '';
      chip.append(sw, name, stat);
      if (seat && app.lan.seat === app.lan.hostSlot && i !== app.lan.seat) {
        const kick = document.createElement('button');
        kick.className = 'btn ghost';
        kick.textContent = t('lan.kick');
        kick.addEventListener('click', () => app.net.kick(i).catch((e) => toast(errText(e.code))));
        chip.append(kick);
      }
      host.append(chip);
    }
    $('#btnLobbyStart').classList.toggle('hidden', app.lan.hostSlot !== app.lan.seat);
    $('#btnLobbyStart').disabled = app.lan.seats.length < 2;
    $('#lobbyStatus').textContent = !lobbyLink(app.lan.roomId) ?
        t('lan.noAddress') :
        t(app.lan.hostSlot === app.lan.seat ? 'lan.hint' : 'lan.joined');
  }
  async function createRoom() {
    if (isFileProtocol()) {
      toast(t('lan.needServer'));
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      if (app.net) app.net.disconnect();
      app.net = new BKNS.NetClient();
      const data = await app.net.createRoom({
        name: $('#lanName').value.trim() || t('app.title'),
        lang: app.settings.lang,
        seatCount: Number($('#lanSeats').value)
      });
      Object.assign(
          app.lan,
          {roomId: data.roomId, seat: data.seat, hostSlot: data.hostSlot, totalSeats: data.totalSeats});
      persistConnection();
      BKNS.Sound.play('join');
      connectRoom();
    } catch (e) {
      toast(errText(e.code));
    } finally {
      setJoining(false);
    }
  }
  async function joinRoom() {
    if (isFileProtocol()) {
      toast(t('lan.needServer'));
      return;
    }
    const code = $('#lanRoomCode').value.trim().toUpperCase();
    if (!code) {
      toast(t('lan.roomCode'));
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      if (app.net) app.net.disconnect();
      app.net = new BKNS.NetClient();
      const data = await app.net.joinRoom({roomId: code, name: $('#lanName').value.trim() || t('app.title')});
      Object.assign(
          app.lan,
          {roomId: data.roomId, seat: data.seat, hostSlot: data.hostSlot, totalSeats: data.totalSeats});
      persistConnection();
      BKNS.Sound.play('join');
      connectRoom();
    } catch (e) {
      toast(errText(e.code));
    } finally {
      setJoining(false);
    }
  }
  async function resumeConnection() {
    const saved = savedConnection();
    if (!saved || isFileProtocol()) return;
    if (joining) return;
    setJoining(true);
    try {
      if (app.net) app.net.disconnect();
      app.net = new BKNS.NetClient(saved.base);
      const data = await app.net.joinRoom({roomId: saved.roomId, token: saved.token});
      Object.assign(
          app.lan,
          {roomId: data.roomId, seat: data.seat, hostSlot: data.hostSlot, totalSeats: data.totalSeats});
      connectRoom();
    } catch (e) {
      if (['room_not_found', 'bad_token'].includes(e.code)) clearConnection();
      toast(errText(e.code));
      refreshLauncher();
    } finally {
      setJoining(false);
    }
  }
  function connectRoom() {
    app.state = null;
    app.recovering = false;
    const client = app.net;
    connectionStatus('reconnecting');
    client.connect(
        (type, payload) => {
          if (app.net !== client) return;
          if (type === 'removed') {
            app.net.reset();
            clearConnection();
            closeModal('overModal');
            app.state = null;
            connectionStatus('disconnected');
            toast(t(payload.reason === 'kicked' ? 'lan.kicked' : 'lan.left'));
            refreshLauncher();
            showView('launcher');
            return;
          }
          applyLanPayload(payload);
        },
        (status) => {
          if (app.net !== client) return;
          connectionStatus(status);
          if (status === 'reconnecting' && !app.recovering) {
            app.recovering = true;
            client.joinRoom({roomId: client.roomId, token: client.token})
                .catch((e) => {
                  if (app.net === client && ['room_not_found', 'bad_token'].includes(e.code)) {
                    app.net.reset();
                    clearConnection();
                    app.state = null;
                    toast(errText(e.code));
                    refreshLauncher();
                    showView('launcher');
                  }
                })
                .finally(() => {
                  if (app.net === client) app.recovering = false;
                });
          }
        });
    renderLobby();
    showView('lobby');
  }
  async function startLanGame() {
    try {
      await app.net.start();
    } catch (e) {
      toast(errText(e.code));
    }
  }
  async function leaveRoom() {
    try {
      if (app.net && app.net.roomId) await app.net.leave();
    } catch (e) {
      if (e.code === 'network_error') {
        app.net.disconnect();
        app.state = null;
        connectionStatus('disconnected');
        closeModal('overModal');
        toast(errText(e.code));
        refreshLauncher();
        showView('launcher');
        return;
      }
      if (!['room_not_found', 'bad_token'].includes(e.code)) {
        toast(errText(e.code));
        return;
      }
    }
    if (app.net) app.net.reset();
    clearConnection();
    app.lan = {roomId: null, seat: 0, hostSlot: 0, seats: [], phase: 'lobby'};
    app.state = null;
    connectionStatus('disconnected');
    closeModal('overModal');
    refreshLauncher();
    showView('launcher');
  }


  return {
    savedConnection,
    persistConnection,
    clearConnection,
    lobbyLink,
    connectionStatus,
    applyLanPayload,
    renderLobby,
    createRoom,
    joinRoom,
    resumeConnection,
    connectRoom,
    startLanGame,
    leaveRoom
  };
}
global.BK = global.BK || {};
global.BK.createLanUI = createLanUI;
})(typeof window !== 'undefined' ? window : globalThis);
