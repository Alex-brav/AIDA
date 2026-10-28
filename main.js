const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { ask } = require('./brain');

const SIZE = 200;
const TICK_MS = 30;

// throwing and falling
const GRAVITY = 1.2;
const MAX_THROW = 40;

// gliding
const GLIDE_SPEED = 2;

// catching herself: this close to a surface while falling, her engines fire and slow her down
const BRAKE_DISTANCE = 40;
const BRAKE_EASE = 0.3;
const BRAKE_MIN_SPEED = 1.5;

// stepping up onto a monitor with a higher floor
const LIFT_SPEED = 6;
const MAX_LIFT = 400;

let win;
let direction = -1; 
let walking = false;
let dragging = false;
let falling = false;
let braking = false;
let lifting = null;
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

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// the world A.I.D.A. lives in, which includes every monitor's usable area, plus the edges of the whole desktop
let world = { displays: [], left: 0, right: 0, top: 0, bottom: 0 };

function buildWorld() {
  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    left: d.workArea.x,
    right: d.workArea.x + d.workArea.width,
    top: d.workArea.y,
    floor: d.workArea.y + d.workArea.height,
  }));
  world = {
    displays,
    left: Math.min(...displays.map((d) => d.left)),
    right: Math.max(...displays.map((d) => d.right)),
    top: Math.min(...displays.map((d) => d.top)),
    bottom: Math.max(...displays.map((d) => d.floor)),
  };
}

function displayAt(x, y) {
  return world.displays.find((d) => x >= d.left && x < d.right && y >= d.top && y <= d.floor) || null;
}

// the floor under this point
// null means there's nothing under her at all (she's above a gap between monitors)
function floorAt(x, y) {
  let best = null;
  for (const d of world.displays) {
    if (x < d.left || x >= d.right) continue;
    if (d.floor < y) continue;
    if (best === null || d.floor < best) best = d.floor;
  }
  return best;
}

// the monitor whose floor is just above this point
function displayAbove(x, y) {
  let best = null;
  for (const d of world.displays) {
    if (x < d.left || x >= d.right) continue;
    if (d.floor >= y) continue;
    if (best === null || d.floor > best.floor) best = d;
  }
  return best;
}

// the floor under her. Past the outer edges of the desktop she uses the floor of the monitor at that edge,
// so a throw off the side still lands somewhere she can walk back from.
function groundLine(centerX, feet) {
  return floorAt(clamp(centerX, world.left, world.right - 1), feet);
}

// the monitor she's on (or closest to), for things like placing the chat window
function displayNear(x, y) {
  return displayAt(x, y) || world.displays.find((d) => d.id === screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).id) || world.displays[0];
}


function moveTo(x, y) {
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: SIZE, height: SIZE });
}

function sendState() {
  if (win) win.webContents.send('state', { walking, direction, dragging, falling, braking: braking || lifting !== null, thinking });
}

function createWindow() {
  const a = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x: a.x + a.width - SIZE - 50,
    y: a.y + a.height - SIZE,
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

// print every display Windows knows about, to learn how they're arranged
function logDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  for (const d of screen.getAllDisplays()) {
    const tag = d.id === primaryId ? ' (primary)' : '';
    console.log(`display ${d.id}${tag}`);
    console.log('  bounds:   ', d.bounds);
    console.log('  workArea: ', d.workArea);
    console.log('  scale:    ', d.scaleFactor);
  }
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
  const d = displayNear(x + SIZE / 2, y + SIZE - 1);
  const chatX = clamp(x + SIZE / 2 - CHAT_W / 2, d.left, d.right - CHAT_W);
  const chatY = clamp(y + 110 - CHAT_H, d.top, d.floor - CHAT_H);
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
  platforms = list
    .map(([id, left, top, right, bottom]) => {
      const r = screen.screenToDipRect(null, { x: left, y: top, width: right - left, height: bottom - top });
      const d = displayAt(r.x + r.width / 2, r.y);
      return {
        id,
        left: r.x,
        right: r.x + r.width,
        top: r.y,
        bottom: r.y + r.height,
        canStand: d !== null && r.y > d.top + 40 && r.y < d.floor,
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

  if (falling) {
    fly();
    return;
  }
  if (lifting) {
    lift();
    return;
  }

  let [x, y] = win.getPosition();
  const minX = world.left;
  const maxX = world.right - SIZE;

  // standing on a window: check it's still there, and ride along if it moved (currently buggy... might delete later)
  let floor = null;
  let ledge = null;
  if (ledgeId !== null) {
    const index = platforms.findIndex((p) => p.id === ledgeId);
    ledge = platforms[index];
    const footX = x + SIZE / 2;
    if (!ledge || !ledge.canStand || footX < ledge.left || footX > ledge.right || !isVisibleAt(index, footX, ledge.top)) {
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

  // not on a window: the floor is whichever monitor's floor is under her
  if (!ledge) {
    const line = groundLine(x + SIZE / 2, y + SIZE);
    if (line === null) {
      rescue();
      return;
    }
    floor = line - SIZE;
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

  if (!walking) return;

  x += direction * GLIDE_SPEED;

  // on a window: at its edge, usually turn around, sometimes glide off
  if (ledge) {
    const footX = x + SIZE / 2;
    if (footX < ledge.left || footX > ledge.right) {
      if (Math.random() < 0.7) {
        x -= direction * GLIDE_SPEED;
        direction *= -1;
        sendState();
      } else {
        startFalling(x, y, direction * GLIDE_SPEED, -4);
        return;
      }
    }
  }

  // crossing into another monitor: look at the floor where she's about to be
  if (!ledge && !offLeft && !offRight) {
    const ahead = x + SIZE / 2;
    const feet = y + SIZE;
    const below = groundLine(ahead, feet);
    if (below === null) {
      const higher = displayAbove(ahead, feet);
      if (higher && feet - higher.floor <= MAX_LIFT) {
        startLift(x - direction * GLIDE_SPEED, higher);
      } else {
        // empty space ahead (a gap between monitors, or a step too tall): turn around
        direction *= -1;
        sendState();
      }
      return;
    }
    if (below > feet) {
      // the next monitor's floor is lower: glide off the edge and catch herself on the way down
      moveTo(x, y);
      startFalling(x, y, direction * GLIDE_SPEED, 0);
      return;
    }
  }

  if ((x <= minX && direction === -1) || (x >= maxX && direction === 1)) {
    x = clamp(x, minX, maxX);
    direction *= -1;
    sendState();
  }
  moveTo(x, y);
}

// thrust straight up beside a taller monitor, then hop onto its floor
function startLift(x, display) {
  const landX = direction === 1 ? display.left - SIZE / 2 + 1 : display.right - SIZE / 2 - 1;
  lifting = { x, landX, targetY: display.floor - SIZE };
  sendState();
}

function lift() {
  let [, y] = win.getPosition();
  const remaining = y - lifting.targetY;
  y -= Math.min(LIFT_SPEED, remaining * 0.2 + 1);
  if (y <= lifting.targetY) {
    moveTo(lifting.landX, lifting.targetY);
    lifting = null;
    sendState();
    return;
  }
  moveTo(lifting.x, y);
}

// she's somewhere with no monitor under her (a monitor was unplugged, or she fell into a gap)
// bring her back from the top of the primary monitor, and let her catch herself on the way down
function rescue() {
  const a = screen.getPrimaryDisplay().workArea;
  const x = a.x + a.width - SIZE - 50;
  const y = a.y;
  lifting = null;
  moveTo(x, y);
  startFalling(x, y, 0, 0);
}

// after the monitors change: if she isn't over any monitor anymore, rescue her
function checkStranded() {
  if (!win || dragging) return;
  const [x, y] = win.getPosition();
  const centerX = x + SIZE / 2;
  const nearEdge = centerX >= world.left - SIZE && centerX < world.right + SIZE;
  if (!nearEdge || groundLine(centerX, y + SIZE) === null) rescue();
}

function startFalling(x, y, speedX, speedY) {
  braking = false;
  lifting = null;
  fx = x;
  fy = y;
  vx = speedX;
  vy = speedY;
  ledgeId = null;
  if (Math.abs(vx) > 0.5) direction = Math.sign(vx);
  falling = true;
  sendState();
}

// one tick of flying: gravity pulls down, and the floor under her (a window or a monitor) catches her
function fly() {
  const oldFeet = fy + SIZE;
  vy += GRAVITY;
  vx *= 0.99;
  fx += vx;
  fy += vy;

  // she can fly off the sides of the desktop, but at most one window-width out (so walking back doesn't take forever)
  if (fx < world.left - SIZE || fx > world.right) {
    fx = clamp(fx, world.left - SIZE, world.right);
    vx = 0;
  }

  // it can fly off the top of the screen too: gravity always brings it back down

  const centerX = fx + SIZE / 2;
  const ground = groundLine(centerX, oldFeet);

  // nothing under her at all, and she's fallen past the bottom of every monitor: bring her back
  if (ground === null && fy > world.bottom + SIZE) {
    rescue();
    return;
  }

  // close to the surface below her while coming down: fire the engines and ease into the landing
  if (vy > 0) {
    const distance = surfaceBelow(centerX, oldFeet, ground) - (fy + SIZE);
    if (distance <= BRAKE_DISTANCE) {
      vy = Math.min(vy, Math.max(BRAKE_MIN_SPEED, distance * BRAKE_EASE));
      vx *= 0.8;
      fy = oldFeet - SIZE + vy;
      if (!braking) {
        braking = true;
        sendState();
      }
    }
  }

  let landed = false;

  // passing down through a window's top edge: land on it
  if (vy > 0) {
    const newFeet = fy + SIZE;
    let best = null;
    platforms.forEach((p, index) => {
      if (!p.canStand) return;
      if (centerX < p.left || centerX > p.right) return;
      if (p.top < oldFeet || p.top > newFeet) return;
      if (!isVisibleAt(index, centerX, p.top)) return;
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

  // reaching the floor of the monitor under her: land
  if (!landed && ground !== null && fy + SIZE >= ground) {
    fy = ground - SIZE;
    vx = 0;
    vy = 0;
    landed = true;
  }

  moveTo(fx, fy);

  const newDirection = Math.abs(vx) > 0.5 ? Math.sign(vx) : direction;
  if (landed || newDirection !== direction) {
    direction = newDirection;
    falling = !landed;
    if (landed) braking = false;
    sendState();
  }
}

// the closest surface under her feet she could land on: a visible window ledge, or the floor of the monitor under her
function surfaceBelow(footX, feet, ground) {
  let best = ground === null ? Infinity : ground;
  platforms.forEach((p, index) => {
    if (!p.canStand || footX < p.left || footX > p.right) return;
    if (p.top < feet || p.top >= best) return;
    if (!isVisibleAt(index, footX, p.top)) return;
    best = p.top;
  });
  return best;
}

// Every 4 seconds randomly hover in place, keep gliding, or turn around
function changeMood() {
  if (dragging || falling || lifting) return;
  const [x] = win.getPosition();
  if (x < world.left || x > world.right - SIZE) return;
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
  lifting = null;
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
  sendState();
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
  sendState();
});

ipcMain.on('chat-close', () => chatWin.hide());
// the monitors changed (plugged in, unplugged, rescaled, moved): rebuild the map and make sure she's still on a screen
function onDisplaysChanged() {
  logDisplays();
  buildWorld();
  checkStranded();
}

app.whenReady().then(() => {
  buildWorld();
  createWindow();
  logDisplays();
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { if (watcher) watcher.kill(); });
