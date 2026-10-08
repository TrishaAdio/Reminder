'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => {
  ipcRenderer.on(channel, (_event, value) => callback(value));
};

contextBridge.exposeInMainWorld('popup', {
  onShow: listen('popup:show'),
  onReplace: listen('popup:replace'),
  onQueue: listen('popup:queue'),
  onClose: listen('popup:close'),
  ready: (cardHeight) => ipcRenderer.invoke('popup:ready', cardHeight),
  answer: (id, action) => ipcRenderer.invoke('popup:answer', id, action),
  exited: () => ipcRenderer.send('popup:exited'),
  setInteractive: (on) => ipcRenderer.send('popup:interactive', on),
  reportFrames: (report) => ipcRenderer.send('popup:frames', report),
});
