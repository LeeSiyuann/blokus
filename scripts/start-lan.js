/* 启动辅助：发现局域网地址并打开浏览器，服务核心仅用约定的内置模块。 */
'use strict';
const os = require('os');
const { spawn } = require('child_process');
const hosts = [...new Set(Object.values(os.networkInterfaces()).flat()
  .filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address))];
require('../server/lan-server.js').main({ shareHosts: hosts, onReady(url) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
} });
