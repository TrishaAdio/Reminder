'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('remindani', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  createReminder: (presetId) => ipcRenderer.invoke('reminder:create', presetId),
  updateReminder: (id, patch) => ipcRenderer.invoke('reminder:update', id, patch),
  deleteReminder: (id) => ipcRenderer.invoke('reminder:delete', id),
  previewReminder: (id) => ipcRenderer.invoke('reminder:preview', id),
  chooseSound: (id) => ipcRenderer.invoke('sound:choose', id),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  showDataFolder: () => ipcRenderer.invoke('app:show-data-folder'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onStateChanged: (callback) => {
    ipcRenderer.on('state:changed', (_event, state) => callback(state));
  },
});
