// Settings-window preload (CommonJS, sandboxed). Exposes a tiny, explicit
// bridge — no Node access leaks into the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qaprism', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getPromptRegistry: () => ipcRenderer.invoke('prompts:registry'),
});
