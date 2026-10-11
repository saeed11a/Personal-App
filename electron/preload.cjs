// Preload for the desktop window.
//
// The renderer runs the same web build as the browser, so nothing privileged is
// handed over — only a flag telling the UI which shell it is running in.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('hikerDesktop', {
  isDesktop: true,
  platform: process.platform,
})
