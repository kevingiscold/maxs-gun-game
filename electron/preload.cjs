// Narrow bridge for the page: app info + the internet tunnel. Nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gunApp', {
  isApp: true,
  info: () => ipcRenderer.invoke('app:info'),
  startTunnel: () => ipcRenderer.invoke('tunnel:start'),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
});
