'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  ipcRenderer.on(channel, (_event, value) => callback(value));
};

contextBridge.exposeInMainWorld('remindani', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  createReminder: (presetId) => ipcRenderer.invoke('reminder:create', presetId),
  updateReminder: (id, patch) => ipcRenderer.invoke('reminder:update', id, patch),
  duplicateReminder: (id) => ipcRenderer.invoke('reminder:duplicate', id),
  deleteReminder: (id) => ipcRenderer.invoke('reminder:delete', id),
  restoreReminder: (deleted) => ipcRenderer.invoke('reminder:restore', deleted),
  testReminder: (id) => ipcRenderer.invoke('reminder:test', id),
  chooseSound: (id) => ipcRenderer.invoke('sound:choose', id),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  pause: (kind) => ipcRenderer.invoke('pause:set', kind),
  addCompanions: () => ipcRenderer.invoke('companion:add'),
  removeCompanion: (file) => ipcRenderer.invoke('companion:remove', file),
  restoreCompanions: () => ipcRenderer.invoke('companion:restore'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  retryUpdate: () => ipcRenderer.invoke('update:retry'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  showDataFolder: () => ipcRenderer.invoke('app:show-data-folder'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onStateChanged: on('state:changed'),
  onUpdateState: on('update:state'),
  onNavigate: on('navigate'),
});
