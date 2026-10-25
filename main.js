const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const size = 200;

  const win = new BrowserWindow({
    width: size,
    height: size,
    // Start AIDA in the bottom right corner of the screen
    x: workArea.x + workArea.width - size - 50,
    y: workArea.y + workArea.height - size,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // This is important for security reasons
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());