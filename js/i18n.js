/* i18n.js — 中英文词条与切换（零依赖） */
(function (global) {
  'use strict';

  const DICT = {
    zh: {
      'app.title': '角斗士棋 BLOKUS',
      'app.subtitle': '四人棋盘格斗 · 复刻版',
      'common.back': '返回', 'common.cancel': '取消', 'common.ok': '确定', 'common.close': '关闭',
      'common.confirm': '确认', 'common.start': '开始', 'common.continue': '继续', 'common.delete': '删除',
      'common.copy': '复制', 'common.download': '下载', 'common.copyText': '复制到剪贴板',
      'common.importFile': '选择文件',
      'launcher.title': '选择游戏模式',
      'launcher.subtitle': '无需安装，选择模式即可开始。',
      'launcher.single': '单机热座', 'launcher.singleDesc': '2–4 人同设备轮流下棋',
      'launcher.lan': '局域网联机', 'launcher.lanDesc': '同一网络内多设备对战',
      'launcher.continue': '继续对局', 'launcher.continueDesc': '回到未完成的对局',
      'launcher.noSave': '暂无可继续的对局',
      'launcher.history': '历史对局', 'launcher.historyDesc': '浏览、回放与导出棋谱',
      'launcher.import': '导入棋谱', 'launcher.importDesc': '从文本 / JSON 还原对局',
      'launcher.fileHint': '当前以 file:// 方式打开：单机与回放可用；局域网联机请运行 launcher.cmd 或 node server/lan-server.js 后从 http:// 打开。',
      'launcher.footer': '零依赖 · 零构建 · 本地存档',
      'lan.title': '局域网联机',
      'lan.create': '创建房间', 'lan.join': '加入房间',
      'lan.roomCode': '房间码', 'lan.name': '你的昵称', 'lan.seatCount': '座位数',
      'lan.hint': '创建后把地址与房间码发给同网络的玩家。',
      'lan.needServer': '联机需要局域网服务：请在主机运行 launcher.cmd（或 node server/lan-server.js --open）。',
      'lan.roomUrl': '房间链接', 'lan.players': '已加入', 'lan.waiting': '等待房主开始…',
      'lan.start': '开始对局', 'lan.full': '房间已满', 'lan.joined': '已加入房间，等待房主开始。',
      'lan.leave': '离开房间', 'lan.connecting': '正在连接…', 'lan.error': '联机操作失败',
      'setup.title': '单机热座设置', 'setup.players': '玩家人数', 'setup.start': '开始下棋',
      'setup.nameHint': '可修改昵称，留空使用默认名。',
      'mode.standard': '4 人标准模式', 'mode.simple': '{n} 人简化模式',
      'mode.two': '2 人 · 简化模式', 'mode.three': '3 人 · 简化模式', 'mode.four': '4 人 · 标准模式',
      'mode.hint': '2/3 人为简化模式：每人一色，仍用 20×20 棋盘；4 人为标准模式。均遵循同色角接触、禁止同色边接触，异色可接触。',
      'mode.legacy': '旧版非标准规则 · 仅供回放',
      'err.own_edge': '不能与你自己的棋子边相邻', 'err.no_own_corner': '必须与你自己的棋子角接触',
      'game.turn': '当前回合', 'game.mustPass': '无子可下，请点击 PASS', 'game.pass': 'PASS',
      'game.undo': '悔棋', 'game.rotate': '旋转 R', 'game.flip': '翻转 F', 'game.place': '落子',
      'game.export': '导出棋谱', 'game.exit': '退出对局', 'game.remaining': '剩余', 'game.squares': '格',
      'game.lastMove': '最后一手', 'game.invalid': '该位置不合法', 'game.gameOver': '对局结束',
      'game.winner': '获胜者', 'game.playAgain': '再来一局', 'game.ranking': '名次', 'game.score': '得分',
      'game.noSelection': '请先在右侧选择一枚棋子', 'game.waiting': '等待对方落子…', 'game.yourTurn': '轮到你了',
      'game.connected': '已连接', 'game.disconnected': '连接已断开', 'game.passDone': '已停一手',
      'game.copied': '棋谱已复制', 'game.hintSelect': '点击棋子 → 点击棋盘 → 落子',
      'history.title': '历史对局', 'history.empty': '暂无历史对局，先来一局吧。',
      'history.moves': '步', 'history.view': '回放', 'history.delete': '删除',
      'history.deleteConfirm': '确定删除该对局记录吗？',
      'history.mode_hotseat': '单机', 'history.mode_lan': '联机',
      'history.status_playing': '进行中', 'history.status_finished': '已结束',
      'replay.title': '对局回放', 'replay.prev': '上一步', 'replay.next': '下一步',
      'replay.play': '播放', 'replay.pause': '暂停', 'replay.first': '回到开头', 'replay.last': '跳到末尾',
      'replay.speed': '速度', 'replay.step': '第 {n} / {total} 步', 'replay.init': '初始局面',
      'replay.pass': 'PASS（停一手）', 'replay.over': '对局已结束',
      'export.title': '棋谱导出', 'export.text': '文本棋谱（BKS1）', 'export.json': 'JSON（无损）',
      'export.copy': '复制', 'export.download': '下载',
      'export.importTitle': '导入棋谱', 'export.importHint': '粘贴 BKS1 文本或 JSON，或选择文件。',
      'export.doImport': '导入并查看', 'export.copied': '已复制到剪贴板', 'export.parseError': '棋谱格式无法识别',
      'toast.saved': '已保存', 'toast.deleted': '已删除', 'toast.importOk': '导入成功',
      'toast.copyFail': '复制失败，请手动选择文本', 'toast.lanError': '联机出错',
      'err.out_of_bounds': '超出棋盘范围', 'err.overlap': '与已有棋子重叠',
      'err.not_corner': '第一手必须盖住你的起始角', 'err.no_own_edge': '必须与你自己的棋子边相邻',
      'err.touch_opponent': '不能与对手的棋子边相邻', 'err.piece_used': '该棋子已使用',
      'err.has_moves': '仍有可落子位置，不能 PASS', 'err.game_over': '对局已结束',
      'err.unknown_piece': '未知棋子', 'err.bad_action': '非法操作'
    },
    en: {
      'app.title': 'BLOKUS',
      'app.subtitle': 'Four-player board duel · remake',
      'common.back': 'Back', 'common.cancel': 'Cancel', 'common.ok': 'OK', 'common.close': 'Close',
      'common.confirm': 'Confirm', 'common.start': 'Start', 'common.continue': 'Continue', 'common.delete': 'Delete',
      'common.copy': 'Copy', 'common.download': 'Download', 'common.copyText': 'Copy to clipboard',
      'common.importFile': 'Choose file',
      'launcher.title': 'Choose a mode',
      'launcher.subtitle': 'No install needed — pick a mode to begin.',
      'launcher.single': 'Local hotseat', 'launcher.singleDesc': '2–4 players sharing one device',
      'launcher.lan': 'LAN multiplayer', 'launcher.lanDesc': 'Multiple devices on the same network',
      'launcher.continue': 'Continue game', 'launcher.continueDesc': 'Return to your unfinished game',
      'launcher.noSave': 'No saved game to continue',
      'launcher.history': 'Game history', 'launcher.historyDesc': 'Browse, replay and export records',
      'launcher.import': 'Import record', 'launcher.importDesc': 'Restore a game from text or JSON',
      'launcher.fileHint': 'Opened via file://: single player and replays work. For LAN, run launcher.cmd or node server/lan-server.js and open via http://.',
      'launcher.footer': 'Zero deps · Zero build · Local saves',
      'lan.title': 'LAN multiplayer',
      'lan.create': 'Create room', 'lan.join': 'Join room',
      'lan.roomCode': 'Room code', 'lan.name': 'Your name', 'lan.seatCount': 'Seats',
      'lan.hint': 'Share the address and room code with players on your network.',
      'lan.needServer': 'LAN needs the tiny server: run launcher.cmd (or node server/lan-server.js --open) on the host.',
      'lan.roomUrl': 'Room link', 'lan.players': 'Joined', 'lan.waiting': 'Waiting for the host to start…',
      'lan.start': 'Start game', 'lan.full': 'Room is full', 'lan.joined': 'Joined. Waiting for the host to start.',
      'lan.leave': 'Leave room', 'lan.connecting': 'Connecting…', 'lan.error': 'LAN operation failed',
      'setup.title': 'Hotseat setup', 'setup.players': 'Players', 'setup.start': 'Start game',
      'setup.nameHint': 'Edit names if you like; blank uses defaults.',
      'mode.standard': '4-player standard mode', 'mode.simple': '{n}-player simplified mode',
      'mode.two': '2 players · Simplified', 'mode.three': '3 players · Simplified', 'mode.four': '4 players · Standard',
      'mode.hint': '2/3 players use simplified mode: one color each on a 20×20 board. 4 players use standard mode. Same-color pieces must touch at corners, never edges; different colors may touch.',
      'mode.legacy': 'Legacy nonstandard rules · Replay only',
      'err.own_edge': 'Your pieces cannot touch edge-to-edge', 'err.no_own_corner': 'Must touch your own piece at a corner',
      'game.turn': 'Current turn', 'game.mustPass': 'No legal move — press PASS', 'game.pass': 'PASS',
      'game.undo': 'Undo', 'game.rotate': 'Rotate R', 'game.flip': 'Flip F', 'game.place': 'Place',
      'game.export': 'Export record', 'game.exit': 'Leave game', 'game.remaining': 'left', 'game.squares': 'sq',
      'game.lastMove': 'Last move', 'game.invalid': 'That placement is illegal', 'game.gameOver': 'Game over',
      'game.winner': 'Winner', 'game.playAgain': 'Play again', 'game.ranking': 'Ranking', 'game.score': 'Score',
      'game.noSelection': 'Pick a piece on the right first', 'game.waiting': 'Waiting for the other player…',
      'game.yourTurn': 'Your turn', 'game.connected': 'Connected', 'game.disconnected': 'Disconnected',
      'game.passDone': 'Passed',
      'game.copied': 'Record copied', 'game.hintSelect': 'Pick a piece → click the board → place',
      'history.title': 'Game history', 'history.empty': 'No games yet — play one first.',
      'history.moves': 'moves', 'history.view': 'Replay', 'history.delete': 'Delete',
      'history.deleteConfirm': 'Delete this game record?',
      'history.mode_hotseat': 'Hotseat', 'history.mode_lan': 'LAN',
      'history.status_playing': 'In progress', 'history.status_finished': 'Finished',
      'replay.title': 'Replay', 'replay.prev': 'Previous', 'replay.next': 'Next',
      'replay.play': 'Play', 'replay.pause': 'Pause', 'replay.first': 'Go to start', 'replay.last': 'Go to end',
      'replay.speed': 'Speed', 'replay.step': 'Move {n} / {total}', 'replay.init': 'Initial position',
      'replay.pass': 'PASS', 'replay.over': 'Game finished',
      'export.title': 'Export record', 'export.text': 'Text record (BKS1)', 'export.json': 'JSON (lossless)',
      'export.copy': 'Copy', 'export.download': 'Download',
      'export.importTitle': 'Import record', 'export.importHint': 'Paste BKS1 text or JSON, or pick a file.',
      'export.doImport': 'Import & view', 'export.copied': 'Copied to clipboard', 'export.parseError': 'Unrecognized record format',
      'toast.saved': 'Saved', 'toast.deleted': 'Deleted', 'toast.importOk': 'Imported',
      'toast.copyFail': 'Copy failed — select the text manually', 'toast.lanError': 'Network error',
      'err.out_of_bounds': 'Out of board bounds', 'err.overlap': 'Overlaps an existing piece',
      'err.not_corner': 'First move must cover your starting corner', 'err.no_own_edge': 'Must touch your own piece edge-to-edge',
      'err.touch_opponent': 'Cannot touch an opponent edge-to-edge', 'err.piece_used': 'Piece already used',
      'err.has_moves': 'You still have legal moves — cannot pass', 'err.game_over': 'Game is over',
      'err.unknown_piece': 'Unknown piece', 'err.bad_action': 'Illegal action'
    }
  };

  let lang = 'zh';

  function t(key, params) {
    const table = DICT[lang] || DICT.zh;
    let s = table[key];
    if (s === undefined) s = DICT.en[key];
    if (s === undefined) { s = key; }
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
    return s;
  }

  function setLang(l) { lang = DICT[l] ? l : 'zh'; return lang; }
  function getLang() { return lang; }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = (lang === 'zh' ? 'zh-CN' : 'en');
    }
  }

  const api = { DICT, t, setLang, getLang, applyI18n };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BK = global.BK || {};
  Object.assign(global.BK, api);
})(typeof window !== 'undefined' ? window : globalThis);

