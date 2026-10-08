/* ui-records.js — 历史、棋谱与回放控制器；通过 ctx 显式注入协调器依赖。 */
(function(global) {
'use strict';
function createRecordsUI(ctx) {
  const {
    $,
    $$,
    app,
    BKNS,
    t,
    setLang,
    applyI18n,
    toast,
    showView,
    errText,
    colorOf,
    modeLabel,
    refreshLauncher,
    saveGame,
    renderGame,
    renderPlayersPanel,
    escapeHtml,
    asState,
    updateTopBar,
    accessibility
  } = ctx;
  /* ---------------- 导出 / 导入 ---------------- */

  function openModal(id) {
    accessibility.openModal(id);
  }
  function closeModal(id) {
    accessibility.closeModal(id);
  }

  function exportContent() {
    const src = asState(app.exportSource || app.state);
    if (!src) return '';
    if (app.exportFmt === 'json') return JSON.stringify(BKNS.toJSONRecord(src), null, 2);
    return BKNS.toText(src);
  }

  function openExport(state) {
    app.exportSource = asState(state || app.state);
    app.exportFmt = 'text';
    $$('#exportSeg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.fmt === 'text'));
    $('#exportText').value = exportContent();
    openModal('exportModal');
  }

  function download(filename, content) {
    const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  async function copyText(text) {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) {
    }
    if (!copied) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        copied = document.execCommand('copy');
      } catch (_) {
      }
      area.remove();
    }
    toast(copied ? t('export.copied') : t('toast.copyFail'));
    return copied;
  }

  function importFromText(text) {
    const raw = String(text || '').trim();
    if (raw.length > 12 * 1024 * 1024) {
      toast(errText('too_large'));
      return null;
    }
    try {
      if (raw[0] === '{') {
        const obj = JSON.parse(raw);
        return obj.format === 'blokus-backup' ? {backup: obj} : BKNS.fromJSONRecord(obj);
      }
      const parsed = BKNS.parseText(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.state;
    } catch (e) {
      toast(t('export.invalid', {reason: errText(e.message)}));
      return null;
    }
  }

  function handleImported(state) {
    if (!state) return;
    if (state.backup) {
      const res = BKNS.importBackup(state.backup);
      if (!res.ok) {
        toast(t('storage.invalidBackup'));
        return;
      }
      app.settings = BKNS.getSettings();
      setLang(app.settings.lang);
      BKNS.Sound.setEnabled(app.settings.sound);
      applyI18n();
      updateTopBar();
      closeModal('importModal');
      toast(t('storage.backupOk'));
      renderHistory();
      showView('history');
      return;
    }
    const res = BKNS.saveRecord(BKNS.toJSONRecord(state));
    if (!res.ok) {
      toast(t('storage.' + res.code));
      return;
    }
    closeModal('importModal');
    toast(t('toast.importOk'));
    if (state.status === 'finished' || state.rulesVersion === 1 || state.mode === 'lan')
      openReplay(BKNS.toJSON(state));
    else {
      app.state = state;
      app.selected = null;
      showView('game');
      renderGame();
      saveGame();
    }
  }

  function renderHistory() {
    const list = BKNS.listGames(app.trash).filter((x) => app.trash ? !!x.deletedAt : true);
    const host = $('#historyList');
    host.innerHTML = '';
    if (!list.length) {
      host.innerHTML = '<p class="muted">' + t('history.empty') + '</p>';
      return;
    }
    for (const item of list) {
      const el = document.createElement('div');
      el.className = 'history-item';
      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = (item.players || []).join(' vs ');
      const sub = document.createElement('div');
      sub.className = 'history-sub';
      const d = new Date(item.updatedAt || item.createdAt);
      sub.textContent = d.toLocaleString(app.settings.lang === 'zh' ? 'zh-CN' : 'en-US') + ' · ' +
          t('history.mode_' + (item.mode || 'hotseat')) + ' · ' + modeLabel(item) + ' · ' + item.moves + ' ' +
          t('history.moves') + ' · ' + t('history.status_' + (item.status || 'playing'));
      meta.appendChild(title);
      meta.appendChild(sub);
      if (item.scores) {
        const scoreLine = document.createElement('div');
        scoreLine.className = 'score-line';
        (item.colors || []).forEach((cid, i) => {
          const sp = document.createElement('span');
          sp.innerHTML = '<span class="name-dot" style="background:' + colorOf(cid) + '"></span>' +
              escapeHtml((item.players || [])[i] || '') + ' ' + item.scores[cid];
          scoreLine.appendChild(sp);
        });
        meta.appendChild(scoreLine);
      }
      const actions = document.createElement('div');
      actions.className = 'row';
      const btnView = document.createElement('button');
      btnView.className = 'btn';
      btnView.textContent = t('history.view');
      if (app.trash) btnView.textContent = t('storage.restore');
      btnView.addEventListener('click', () => {
        if (app.trash) {
          const res = BKNS.restoreGame(item.id);
          if (!res.ok) toast(t('storage.' + res.code));
          renderHistory();
          refreshLauncher();
        } else
          openRecord(item.id);
      });
      const btnDel = document.createElement('button');
      btnDel.className = 'btn ghost';
      btnDel.textContent = t('history.delete');
      btnDel.addEventListener('click', () => {
        if (confirm(t('history.deleteConfirm'))) {
          BKNS.deleteGame(item.id);
          toast(t('toast.deleted'));
          renderHistory();
          refreshLauncher();
        }
      });
      actions.appendChild(btnView);
      if (!app.trash) actions.appendChild(btnDel);
      el.appendChild(meta);
      el.appendChild(actions);
      host.appendChild(el);
    }
  }

  function openRecord(id) {
    const rec = BKNS.loadRecord(id);
    if (!rec || !rec.game) return;
    try {
      const state = BKNS.fromJSON(rec.game);
      if (state.mode === 'lan' || state.rulesVersion === 1 || state.status === 'finished') {
        openReplay(BKNS.toJSON(state));
        return;
      }
      app.state = state;
      app.selected = null;
      showView('game');
      renderGame();
      saveGame();
    } catch (e) {
      toast(t('export.invalid', {reason: errText(e.message)}));
    }
  }

  function openReplay(gameJson) {
    app.replaySource = gameJson;
    if (app.replay) app.replay.dispose();
    app.replay = new BKNS.ReplayPlayer(gameJson, {
      onUpdate: (state, index, total, playing) => {
        if (document.body.dataset.view !== 'replay') return;
        app.replayState = state;
        $('#replayMode').textContent = modeLabel(state);
        $('#replaySlider').max = String(total);
        $('#replaySlider').value = String(index);
        $('#btnPlay').textContent = playing ? '⏸' : '▶';
        $('#btnPlay').title = t(playing ? 'replay.pause' : 'replay.play');
        $('#replayInfo').innerHTML = buildReplayInfo(gameJson, state, index, total);
        renderPlayersPanel($('#replayPlayers'), state);
        renderReplayBoard();
      }
    });
    showView('replay');
    app.replay.seek(0);
  }

  function buildReplayInfo(gameJson, state, index, total) {
    const moves = gameJson.moves || [];
    let html = '<b>' + escapeHtml((gameJson.players || []).map((p) => p.name).join(' vs ')) + '</b>';
    html += '<small>' + (index === 0 ? t('replay.init') : t('replay.step', {n: index, total})) + '</small>';
    if (index > 0 && moves[index - 1]) {
      const m = moves[index - 1];
      const p = gameJson.players[m.player];
      if (m.type === 'pass' || m.type === 'resign') {
        html += '<div class="move-detail">' + escapeHtml(p.name) + ' · ' +
            t(m.type === 'resign' ? 'game.resign' : 'replay.pass') + '</div>';
      } else {
        html += '<div class="move-detail">' + escapeHtml(p.name) + ' · <b>' + m.piece + '</b> @ ' +
            BKNS.pos(m.anchor) + ' · R' + (m.rot || 0) + ' M' + (m.mirror ? 1 : 0) + '</div>';
      }
    }
    if (state.status === 'finished' && index === total) {
      const res = state.result;
      const winners = res.winners || [res.ranking[0]];
      const names = winners.map((id) => state.players.find((p) => p.id === id).name).join(' / ');
      html += '<div class="move-detail">' + t(winners.length > 1 ? 'game.tie' : 'game.winner') + ': <b>' +
          escapeHtml(names) + '</b> (' + res.scores[winners[0]] + ')</div>';
    }
    return html;
  }

  function renderReplayBoard() {
    if (!app.replayRenderer) return;
    if (!app.replayState) {
      app.replayRenderer.setState(null);
      app.replayRenderer.draw();
      return;
    }
    app.replayRenderer.setState(
        app.replayState,
        {patternMode: app.settings.patternMode, cursor: accessibility.cursor('replayCanvas')});
    app.replayRenderer.draw();
    accessibility.updateBoard('replayCanvas', app.replayState);
  }


  return {
    openModal,
    closeModal,
    exportContent,
    openExport,
    download,
    copyText,
    importFromText,
    handleImported,
    renderHistory,
    openRecord,
    openReplay,
    buildReplayInfo,
    renderReplayBoard
  };
}
global.BK = global.BK || {};
global.BK.createRecordsUI = createRecordsUI;
})(typeof window !== 'undefined' ? window : globalThis);
