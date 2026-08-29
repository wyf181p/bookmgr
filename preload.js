// Preload script: safely expose printing capability to the renderer process (contextIsolation enabled)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Print the given HTML: the main process generates a PDF then opens a preview window
  printHtml: (html, title) => ipcRenderer.invoke('print-html', { html, title }),
  // Print a PDF: pass raw PDF bytes directly; the main process opens a pdf.js preview window (Electron has no built-in PDF viewer)
  printPdf: (base64, title) => ipcRenderer.invoke('print-pdf', { base64, title }),
  // Open a file with the system default program (main process shell.openPath)
  openExternalFile: (filePath) => ipcRenderer.invoke('open-external-file', filePath),
  // Show the system "Open With" dialog so the user can choose the program to open the file (main process rundll32 OpenAs_RunDLL)
  openWithDialog: (filePath) => ipcRenderer.invoke('open-with-dialog', filePath),
  // Read the server listen configuration (used for echoing back in the settings window)
  getSettings: () => ipcRenderer.invoke('settings-get'),
  // Synchronously read settings (the renderer fetches the interface language on startup, used by i18n.js)
  getSettingsSync: () => ipcRenderer.sendSync('settings-get-sync'),
  // Save the server listen configuration (settings window OK button)
  saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings)
});
