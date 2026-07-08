// Main-window preload (CommonJS, sandboxed). Exposes a minimal bridge so the
// web UI can open the native Settings window and knows it's running in the
// desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qaprism', {
  isDesktop: true,
  openSettings: () => ipcRenderer.send('settings:open'),
});
