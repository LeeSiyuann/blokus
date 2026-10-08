/* 可访问交互：棋盘键盘、触控确认、读屏副本与弹窗焦点；不修改规则。 */
(function(global) {
'use strict';
function createAccessibilityUI(ctx) {
  const {$, app, BKNS, t, renderBoard, renderReplayBoard, tryPlaceAt} = ctx;
  const boards = new Map();
  const dialogs = [];
  let pinned = false;
  function position(info, cell, focus) {
    info.cell = cell;
    info.grid.setAttribute('aria-activedescendant', info.id + '-cell-' + (cell.r * 20 + cell.c));
    if (info.id === 'boardCanvas') app.hover = cell;
    if (focus) info.grid.focus({preventScroll: true});
    (info.id === 'boardCanvas' ? renderBoard : renderReplayBoard)();
  }
  function bindBoard(id, gridId, readonly) {
    const canvas = $('#' + id), grid = $('#' + gridId);
    const info = {id, canvas, grid, cell: {r: 0, c: 0}, readonly, key: null};
    boards.set(id, info);
    for (let r = 0; r < 20; r++) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      for (let c = 0; c < 20; c++) {
        const cell = document.createElement('span');
        cell.id = id + '-cell-' + (r * 20 + c);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-rowindex', r + 1);
        cell.setAttribute('aria-colindex', c + 1);
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
    grid.addEventListener('focus', () => {
      const state = readonly ? app.replayState : app.state;
      if (!state) return;
      const corner = state.players[state.turn].corner;
      position(
          info,
          !readonly && app.hover ? app.hover :
              !readonly          ? {r: corner[0], c: corner[1]} :
                                   info.cell);
    });
    grid.addEventListener('keydown', e => {
      let {r, c} = info.cell;
      if (e.key === 'ArrowUp')
        r--;
      else if (e.key === 'ArrowDown')
        r++;
      else if (e.key === 'ArrowLeft')
        c--;
      else if (e.key === 'ArrowRight')
        c++;
      else if (e.key === 'Home') {
        c = 0;
        if (e.ctrlKey) r = 0;
      } else if (e.key === 'End') {
        c = 19;
        if (e.ctrlKey) r = 19;
      } else if (!readonly && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.stopPropagation();
        tryPlaceAt(r, c);
        return;
      } else
        return;
      e.preventDefault();
      e.stopPropagation();
      pinned = true;
      position(info, {r: Math.max(0, Math.min(19, r)), c: Math.max(0, Math.min(19, c))});
    });
    if (readonly) return;
    let pointerType = 'mouse', frame = null;
    canvas.addEventListener('pointerdown', e => {
      pointerType = e.pointerType;
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      pinned = false;
      app.hover = app.renderer.toCell(e.clientX, e.clientY);
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          renderBoard();
        });
    });
    canvas.addEventListener('pointerleave', () => {
      if (pinned || pointerType === 'touch') return;
      app.hover = null;
      renderBoard();
    });
    canvas.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch') return;
      const cell = app.renderer.toCell(e.clientX, e.clientY);
      if (cell) {
        pinned = true;
        position(info, cell);
      }
    });
    canvas.addEventListener('click', e => {
      if (pointerType === 'touch' || e.pointerType === 'touch') return;
      const cell = app.renderer.toCell(e.clientX, e.clientY);
      if (cell) tryPlaceAt(cell.r, cell.c);
    });
  }
  function updateBoard(id, state, preview) {
    const info = boards.get(id);
    if (!info || !state) return;
    const key = state.id + ':' + state.moves.length + ':' + BKNS.getLang();
    if (info.key !== key || info.board !== state.board) {
      info.key = key;
      info.board = state.board;
      for (let i = 0; i < 400; i++) {
        const p = state.players[state.board[i]];
        $('#' + id + '-cell-' + i).textContent = String.fromCharCode(65 + i % 20) + (Math.floor(i / 20) + 1) +
            ' · ' + (p ? t('color.' + p.id) + ' · ' + p.name : t('access.empty'));
      }
    }
    info.grid.setAttribute('aria-label', t(info.readonly ? 'access.replayBoard' : 'access.board'));
    info.grid.setAttribute('aria-readonly', String(info.readonly));
    if (!info.readonly) {
      const status = $('#boardStatus');
      const text = app.hover ? String.fromCharCode(65 + app.hover.c) + (app.hover.r + 1) +
              (preview ? ' · ' + t(preview.ok ? 'access.valid' : 'access.invalid') +
                       (preview.code ? ' · ' + ctx.errText(preview.code) : '') :
                         '') :
                               '';
      if (status.textContent !== text) status.textContent = text;
    }
  }
  function cursor(id) {
    const info = boards.get(id);
    return info && document.activeElement === info.grid ? info.cell : null;
  }
  function previewAt(cell) {
    pinned = true;
    position(boards.get('boardCanvas'), cell);
  }
  function openModal(id) {
    const modal = $('#' + id);
    if (!dialogs.some(d => d.id === id)) dialogs.push({id, returnTo: document.activeElement});
    modal.classList.remove('hidden');
    document.body.classList.add('dialog-open');
    $('main').inert = true;
    $('.topbar').inert = true;
    for (const d of dialogs) $('#' + d.id).inert = d.id !== id;
    const target =
        modal.querySelector('textarea') || modal.querySelector('button:not(:disabled),input:not([hidden])');
    if (target) target.focus({preventScroll: true});
  }
  function closeModal(id) {
    const at = dialogs.findIndex(d => d.id === id), entry = dialogs[at];
    if (at >= 0) dialogs.splice(at, 1);
    $('#' + id).classList.add('hidden');
    $('#' + id).inert = false;
    const active = dialogs.at(-1);
    document.body.classList.toggle('dialog-open', !!active);
    $('main').inert = !!active;
    $('.topbar').inert = !!active;
    if (active) {
      $('#' + active.id).inert = false;
      $('#' + active.id).querySelector('button,textarea,input')?.focus();
    } else if (entry?.returnTo?.isConnected && !entry.returnTo.closest('.view[inert]'))
      entry.returnTo.focus({preventScroll: true});
  }
  function showView(name, changed) {
    for (const view of document.querySelectorAll('.view')) view.inert = view.id !== 'view-' + name;
    if (!changed || dialogs.length) return;
    const view = $('#view-' + name),
          target = view.querySelector('h1,h2') || view.querySelector('[role=grid],button');
    if (target) {
      if (/^H[12]$/.test(target.tagName)) target.tabIndex = -1;
      target.focus({preventScroll: true});
    }
  }
  function bind() {
    bindBoard('boardCanvas', 'boardAccess', false);
    bindBoard('replayCanvas', 'replayAccess', true);
    document.addEventListener('keydown', e => {
      const top = dialogs.at(-1);
      if (!top) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal(top.id);
        return;
      }
      if (e.key !== 'Tab') return;
      const list = [
        ...$('#' + top.id)
            .querySelectorAll('button:not(:disabled),textarea,input:not([hidden]),select,[tabindex="0"]')
      ].filter(el => el.getClientRects().length);
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
        e.preventDefault();
        (e.shiftKey ? list.at(-1) : list[0]).focus();
      }
    }, true);
  }
  return {bind, updateBoard, cursor, previewAt, openModal, closeModal, showView};
}
global.BK = global.BK || {};
global.BK.createAccessibilityUI = createAccessibilityUI;
})(typeof window !== 'undefined' ? window : globalThis);
