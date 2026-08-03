'use strict'

/**
 * Bridge between the app's own pages and the main process.
 *
 * This preload is attached to every page the app loads, including the bundled
 * web UI, so the API is only exposed on the local `file://` pages that make up
 * the desktop shell. The main process re-checks the sender on every channel —
 * this guard is the first of the two, not the only one.
 */

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('homebridgeDesktop', {
    bootstrap: () => ipcRenderer.invoke('hbd:bootstrap'),
    onLog: callback => subscribe('hbd:log', callback),
    onSettings: callback => subscribe('hbd:settings', callback),
    onState: callback => subscribe('hbd:state', callback),
    open: target => ipcRenderer.invoke('hbd:open', target),
    pickStoragePath: () => ipcRenderer.invoke('hbd:pick-storage'),
    saveSettings: patch => ipcRenderer.invoke('hbd:settings-save', patch),
    serverAction: action => ipcRenderer.invoke('hbd:server-action', action),
  })
}
