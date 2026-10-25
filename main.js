const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { ask } = require('./brain');

const SIZE = 200;
const TICK_MS = 30;

// throwing and falling
const GRAVITY = 1.2;
const MAX_THROW = 40;

const AIR_TICKS = 14;
const GROUND_TICKS = 8;
const HOP_SPEED = 4;
const HOP_HEIGHT = 24;

let win;
let direction = -1; 
let walking = false;
let dragging = false;
let falling = false;
let hopTick = 0;
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };
let dragSamples = [];
let vx = 0;
let vy = 0;
let fx = 0;
let fy = 0;

// chat window
const CHAT_W = 320;
const CHAT_H = 300;
let chatWin = null;
let dragStartCursor = { x: 0, y: 0 }; 

// conversation memory
let history = [];
let thinking = false;
const MAX_HISTORY = 20;

// window ledges
let platforms = [];
let ledgeId = null;
let ledgeLeft = 0;
let watcher = null;

const area = () => screen.getPrimaryDisplay().workArea; 
const groundY = () => area().y + area().height - SIZE;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));


function moveTo(x, y) {
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: SIZE, height: SIZE });
}

function sendState() {
  if (win) win.webContents.send('state', { walking, direction, dragging, falling });
}

function sendHop(height) {
  if (win) win.webContents.send('hop', height);
}

function createWindow() {
  const a = area();
  win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x: a.x + a.width - SIZE - 50,
    y: groundY(),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  win.webContents.on('did-finish-load', sendState);

  setInterval(tick, TICK_MS);
  setInterval(changeMood, 4000);
  startWindowWatcher();
  createChatWindow();
}

function createChatWindow() {
  chatWin = new BrowserWindow({
    width: CHAT_W,
    height: CHAT_H,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'chat-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  chatWin.loadFile('chat.html');
}

// open the chat just above A.I.D.A.'s head, or close it if it's already open
function toggleChat() {
  if (chatWin.isVisible()) {
    chatWin.hide();
    return;
  }
  const [x, y] = win.getPosition();
  const a = area();
  const chatX = clamp(x + SIZE / 2 - CHAT_W / 2, a.x, a.x + a.width - CHAT_W);
  const chatY = clamp(y + 140 - CHAT_H, a.y, a.y + a.height - CHAT_H);
  chatWin.setBounds({ x: Math.round(chatX), y: Math.round(chatY), width: CHAT_W, height: CHAT_H });
  chatWin.show();
  chatWin.focus();
}

// Start window-watcher.ps1, which reports where every app window is twice a second
function startWindowWatcher() {
  const script = path.join(__dirname, 'window-watcher.ps1');
  watcher = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-IgnorePid', String(process.pid),
  ], { windowsHide: true });

  let buffer = '';
  let firstReport = true;
  watcher.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        updatePlatforms(JSON.parse(line));
        if (firstReport) {
          console.log(`A.I.D.A. can see ${platforms.length} windows (${platforms.filter((p) => p.canStand).length} she can stand on)`);
          firstReport = false;
        }
      } catch (err) {
        console.error('Could not read the window list:', line);
      }
    }
  });
  watcher.stderr.on('data', (chunk) => console.error('window-watcher:', chunk.toString()));
}

// Turn the raw window list into ledges
function updatePlatforms(list) {
  const a = area();
  platforms = list
    .map(([id, left, top, right, bottom]) => {
      const r = screen.screenToDipRect(null, { x: left, y: top, width: right - left, height: bottom - top });
      return {
        id,
        left: r.x,
        right: r.x + r.width,
        top: r.y,
        bottom: r.y + r.height,
        canStand: r.y > a.y + 40 && r.y < a.y + a.height,
      };
    });
}

function isVisibleAt(index, x, y) {
  for (let i = 0; i < index; i++) {
    const p = platforms[i];
    if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom) return false;
  }
  return true;
}

function tick() {
  if (!win || dragging) return;
  const a = area();
  const ground = groundY();
  const minX = a.x;
  const maxX = a.x + a.width - SIZE;

  if (falling) {
    fly(a, ground, minX, maxX);
    return;
  }

  let [x, y] = win.getPosition();

  // standing on a window: check it's still there, and ride along if it moved (currently buggy... might delete later)
  let floor = ground;
  let ledge = null;
  if (ledgeId !== null) {
    const index = platforms.findIndex((p) => p.id === ledgeId);
    ledge = platforms[index];
    const footX = x + SIZE / 2;
    if (!ledge || !ledge.canStand || footX < ledge.left || footX > ledge.right || !isVisibleAt(index, footX, ledge.top)) {
      hopTick = 0;
      sendHop(0);
      startFalling(x, y, 0, 0);
      return;
    }
    if (ledge.left !== ledgeLeft) {
      x += ledge.left - ledgeLeft;   
      ledgeLeft = ledge.left;
      moveTo(x, y);
    }
    floor = Math.round(ledge.top) - SIZE;
  }

  if (y !== floor) {
    if (y < floor) startFalling(x, y, 0, 0);
    else moveTo(x, floor);
    return;
  }

  const offLeft = !ledge && x < minX;
  const offRight = !ledge && x > maxX;
  if (offLeft || offRight) {
    const back = offLeft ? 1 : -1;
    if (!walking || direction !== back) {
      walking = true;
      direction = back;
      sendState();
    }
  }

  if (!walking && hopTick === 0) return;

  hopTick++;

  if (hopTick <= AIR_TICKS) {
    x += direction * HOP_SPEED;

    // on a window: at its edge, usually turn around, sometimes hop off
    if (ledge) {
      const footX = x + SIZE / 2;
      if (footX < ledge.left || footX > ledge.right) {
        if (Math.random() < 0.7) {
          x -= direction * HOP_SPEED;
          direction *= -1;
          sendState();
        } else {
          hopTick = 0;
          sendHop(0);
          startFalling(x, y, direction * HOP_SPEED, -6); 
          return;
        }
      }
    }

    if ((x <= minX && direction === -1) || (x >= maxX && direction === 1)) {
      x = clamp(x, minX, maxX);
      direction *= -1;   
      sendState();
    }
    moveTo(x, y);
    sendHop(-Math.sin(Math.PI * hopTick / AIR_TICKS) * HOP_HEIGHT);
  } else {
    sendHop(0);
    if (hopTick >= AIR_TICKS + GROUND_TICKS) hopTick = 0;
  }
}

function startFalling(x, y, speedX, speedY) {
  fx = x;
  fy = y;
  vx = speedX;
  vy = speedY;
  ledgeId = null;
  if (Math.abs(vx) > 0.5) direction = Math.sign(vx);
  falling = true;
  sendState();
}

// one tick of flying: gravity pulls down, edges bounce, the taskbar catches it
function fly(a, ground, minX, maxX) {
  const oldFeet = fy + SIZE; 
  vy += GRAVITY;
  vx *= 0.99;
  fx += vx;
  fy += vy;

  // it can fly off the side of the screen, but at most one window-width out (so walking back doesn't take forever)
  if (fx < minX - SIZE || fx > maxX + SIZE) {
    fx = clamp(fx, minX - SIZE, maxX + SIZE);
    vx = 0;
  }

  // it can fly off the top of the screen too: gravity always brings it back down

  let landed = false;

  // passing down through a window's top edge: land on it
  if (vy > 0) {
    const footX = fx + SIZE / 2;
    const newFeet = fy + SIZE;
    let best = null;
    platforms.forEach((p, index) => {
      if (!p.canStand) return;
      if (footX < p.left || footX > p.right) return;
      if (p.top < oldFeet || p.top > newFeet) return;
      if (!isVisibleAt(index, footX, p.top)) return;
      if (!best || p.top < best.top) best = p;
    });
    if (best) {
      fy = Math.round(best.top) - SIZE;
      vx = 0;
      vy = 0;
      landed = true;
      ledgeId = best.id;
      ledgeLeft = best.left;
    }
  }

  if (!landed && fy >= ground) {
    fy = ground;
    vx = 0;
    vy = 0;
    landed = true;
  }

  moveTo(fx, fy);

  const newDirection = Math.abs(vx) > 0.5 ? Math.sign(vx) : direction;
  if (landed || newDirection !== direction) {
    direction = newDirection;
    falling = !landed;
    sendState();
  }
}

// Every 4 seconds randomly stand still, keep hopping, or turn around
function changeMood() {
  if (dragging || falling) return;
  const [x] = win.getPosition();
  const a = area();
  if (x < a.x || x > a.x + a.width - SIZE) return;
  const roll = Math.random();
  if (roll < 0.4) {
    walking = false;
  } else {
    walking = true;
    if (roll < 0.6) direction *= -1;
  }
  sendState();
}

// follow the mouse while dragging, remembering where it was recently
ipcMain.on('drag-start', () => {
  dragging = true;
  falling = false;
  hopTick = 0;
  sendHop(0);
  const cursor = screen.getCursorScreenPoint();
  dragStartCursor = cursor;
  const [wx, wy] = win.getPosition();
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy };
  dragSamples = [];
  sendState();
  dragTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    moveTo(c.x - dragOffset.x, c.y - dragOffset.y);
    dragSamples.push({ x: c.x, y: c.y, time: Date.now() });
    if (dragSamples.length > 6) dragSamples.shift();
  }, 16);
});

// throw it with the speed the mouse was moving
ipcMain.on('drag-end', () => {
  if (!dragging) return;
  dragging = false;
  clearInterval(dragTimer);

  // catch weather it was a chat toggle or a drag.
  const end = screen.getCursorScreenPoint();
  const moved = Math.abs(end.x - dragStartCursor.x) + Math.abs(end.y - dragStartCursor.y);
  if (moved < 5) toggleChat();
  let speedX = 0;
  let speedY = 0;
  const first = dragSamples[0];
  const last = dragSamples[dragSamples.length - 1];
  if (first && last && last.time > first.time) {
    const ticks = (last.time - first.time) / TICK_MS;
    speedX = clamp((last.x - first.x) / ticks, -MAX_THROW, MAX_THROW);
    speedY = clamp((last.y - first.y) / ticks, -MAX_THROW, MAX_THROW);
  }

  const [x, y] = win.getPosition();
  startFalling(x, y, speedX, speedY);
});

// chat window messages: ask the brain and stream the reply into the chat
ipcMain.on('chat-send', async (_event, text) => {
  if (thinking) return;
  thinking = true;
  history.push({ role: 'user', content: text });
  chatWin.webContents.send('chat-start');

  try {
    const reply = await ask(history, (piece) => chatWin.webContents.send('chat-piece', piece));
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  } catch (err) {
    chatWin.webContents.send('chat-piece', `(my brain isn't answering: ${err.message})`);
    history.pop();
  }

  chatWin.webContents.send('chat-done');
  thinking = false;
});

ipcMain.on('chat-close', () => chatWin.hide());
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { if (watcher) watcher.kill(); });
