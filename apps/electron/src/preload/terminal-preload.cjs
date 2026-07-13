/**
 * Terminal preload — exposes IPC bridge for the terminal window.
 * Loaded only by terminal BrowserWindows (not the main app window).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminalAPI', {
  // PTY output → renderer
  onData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  // Renderer → PTY input
  write: (data) => ipcRenderer.send('terminal:input', data),
  // Renderer → PTY resize
  resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
  // PTY exited
  onExit: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },
});
