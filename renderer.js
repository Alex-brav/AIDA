const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// size and placement, in sprite pixels (each one is drawn SCALE screen pixels wide)
const SCALE = 2;
const SPRITE_W = 32;
const BODY_H = 28;
const TOP = 2;
const HOVER = 10;
const WORK_H = TOP + BODY_H + HOVER;
const DRAW_W = SPRITE_W * SCALE;
const DRAW_H = WORK_H * SCALE;
const DRAW_X = Math.round((canvas.width - DRAW_W) / 2);
const DRAW_Y = canvas.height - DRAW_H;

// her face: the eyes are drawn by code on the blank screen, so they can blink and look around
const EYE_TOP = 11;
const EYE_XS = [9, 14];
const EYE_COLORS = ['rgb(66, 140, 28)', 'rgb(66, 140, 28)', 'rgb(53, 115, 20)', 'rgb(53, 115, 20)'];
const LOOKS = [-2, 0, 0, 2, 4];
const SCREEN_COLOR = 'rgb(27, 27, 27)';

// antenna: a rigid rod in column 25, from the tip (row 0) down to its hinge right above the black part (row 14)
const ANTENNA_X = 25;
const ANTENNA_PIVOT = 14;
const ANTENNA_WALL_TOP = 6;
const SIDE_WALL_COLOR = 'rgb(104, 106, 112)';
const ANTENNA_OFF = 'rgb(27, 27, 27)';
// tilting back in her 3/4 view: 2 pixels right for every 1 down
const TILT_BACK = [1, 0.5];
const TILT_MAX = 24;
const TILT_MIN = -4;
const SPRING = 0.02;
const DAMPING = 0.9;

// the loading bar inside the thinking frames
const BAR_LEFT = 6;
const BAR_WIDTH = 14;
const BAR_TOP = 11;
const BAR_HEIGHT = 4;

// pulse thruster
const THRUSTER_X = 15;
const STEP_FRAMES = 4;
const RING_EVERY = 5;
const RING_EVERY_BRAKING = 2;
const RING_COLORS = [[190, 255, 150], [130, 240, 95], [100, 225, 65], [80, 205, 52], [65, 180, 44], [55, 155, 38]];
const NOZZLE_COLORS = ['rgb(80, 205, 52)', 'rgb(130, 240, 95)', null, 'rgb(130, 240, 95)', 'rgb(80, 205, 52)'];

let state = { walking: false, direction: -1, dragging: false, falling: false, braking: false, thinking: false };
let frame = 0;

window.aida.onState((s) => { state = s; });
window.aida.onEmote((name) => playEmote(name));

// grab and drop
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) window.aida.dragStart();
});
window.addEventListener('mouseup', () => window.aida.dragEnd());

// right-click: preview her reactions (cool, then alert)
let nextTestEmote = 0;
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  playEmote(['cool', 'alert'][nextTestEmote++ % 2]);
});

function load(name) {
  const img = new Image();
  img.src = `assets/aida/${name}.png`;
  return img;
}

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// every image she uses. Change a path here to swap a sprite.
const sprites = {
  body: load('body'),
  thinking: range(8).map((n) => load(`thinking/${n}`)),
  alert: range(2).map((n) => load(`alert/${n}`)),
  cool: range(11).map((n) => load(`cool/${n}`)),
  drag: range(4).map((n) => load(`drag/${n}`)),
};

// being dragged: dizzy red eyes wobbling while the antenna flashes red, looping until you let go
const DRAG_HOLD = 8;

// reactions: which frames play, in order, and how many screen frames each one stays up
const EMOTES = {
  alert: { frames: [0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1], hold: 8 },
  cool: { frames: [0, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10], hold: 5 },
};

let emote = null;

function playEmote(name) {
  if (EMOTES[name]) emote = { name, start: frame };
}

function emoteImage() {
  if (!emote) return null;
  const e = EMOTES[emote.name];
  const i = Math.floor((frame - emote.start) / e.hold);
  if (i >= e.frames.length) {
    emote = null;
    return null;
  }
  return sprites[emote.name][e.frames[i]];
}

// thinking: fill the bar, hold it, drain it from the left, repeat until the answer arrives
let thinkStart = 0;
let wasThinking = false;

function thinkingImage() {
  const step = Math.floor((frame - thinkStart) / 6) % 19;
  if (step < 8) return { img: sprites.thinking[step], drain: 0 };
  if (step < 12) return { img: sprites.thinking[7], drain: 0 };
  return { img: sprites.thinking[7], drain: (step - 11) * 2 };
}

// random little habits: blinking, looking around, and the antenna light flickering off now and then
const rand = (min, max) => min + Math.floor(Math.random() * (max - min));
let blinkStart = -100;
let nextBlink = rand(180, 360);
let look = 0;
let lookTarget = 0;
let nextLook = rand(180, 420);
let antennaOffStart = -100;
let nextAntennaBlink = rand(1200, 2400);

function updateHabits() {
  if (frame >= nextBlink) {
    blinkStart = frame;
    nextBlink = frame + rand(180, 420);
  }
  if (frame >= nextLook) {
    lookTarget = LOOKS[rand(0, LOOKS.length)];
    nextLook = frame + rand(150, 420);
  }
  if (frame % 4 === 0 && look !== lookTarget) look += Math.sign(lookTarget - look);
  if (frame >= nextAntennaBlink) {
    antennaOffStart = frame;
    nextAntennaBlink = frame + rand(1200, 2400);
  }
}

// how open her eyes are: 4 rows tall, squeezing to 1 row during a blink
function eyeHeight() {
  const b = frame - blinkStart;
  if (b < 0 || b >= 8) return 4;
  if (b < 2 || b >= 6) return 2;
  return 1;
}

// scratch canvases: "body" is the 32x32 sprite with her face and antenna, "work" adds the thruster below her
const body = document.createElement('canvas');
body.width = SPRITE_W;
body.height = BODY_H + 4;
const bctx = body.getContext('2d');

const work = document.createElement('canvas');
work.width = SPRITE_W;
work.height = WORK_H;
const wctx = work.getContext('2d');

function drawBody() {
  const emoteImg = emoteImage();
  let img = sprites.body;
  let drain = 0;
  if (state.dragging) img = sprites.drag[Math.floor(frame / DRAG_HOLD) % sprites.drag.length];
  else if (emoteImg) img = emoteImg;
  else if (state.thinking) ({ img, drain } = thinkingImage());

  bctx.clearRect(0, 0, body.width, body.height);
  bctx.drawImage(img, 0, 0);

  // the thinking bar drains from the left by painting the screen color over it
  if (drain > 0) {
    bctx.fillStyle = SCREEN_COLOR;
    bctx.fillRect(BAR_LEFT, BAR_TOP, Math.min(drain, BAR_WIDTH), BAR_HEIGHT);
  }

  // her normal face: eyes drawn on the blank screen
  if (img === sprites.body) {
    const h = eyeHeight();
    for (const eyeX of EYE_XS) {
      for (let row = 4 - h; row < 4; row++) {
        bctx.fillStyle = EYE_COLORS[row];
        bctx.fillRect(eyeX + look, EYE_TOP + row, 1, 1);
      }
    }
  }

  const tip = drawAntenna(img);

  // antenna light: off for a moment, once in a long while
  const off = frame - antennaOffStart;
  if (off >= 0 && off < 10) {
    bctx.fillStyle = ANTENNA_OFF;
    bctx.fillRect(tip.x, tip.y, 1, 1);
  }
}

// antenna angle, in degrees back from straight up. A spring pulls it toward a target, so it overshoots and wobbles.
let tilt = 0;
let tiltSpeed = 0;

function antennaTarget() {
  if (state.dragging) return 10 + 10 * Math.sin(frame / 5);
  if (state.walking) return 18;
  return 6 + 4 * Math.sin(frame / 80);
}

function updateTilt() {
  tiltSpeed += (antennaTarget() - tilt) * SPRING;
  tiltSpeed *= DAMPING;
  tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, tilt + tiltSpeed));
}

// take the straight rod out of the sprite, then redraw it pixel by pixel at the current angle around its hinge.
// Each pixel is copied from the sprite, so the tip keeps whatever color that frame gives it.
function drawAntenna(img) {
  bctx.clearRect(ANTENNA_X, 0, 1, ANTENNA_WALL_TOP);
  bctx.fillStyle = SIDE_WALL_COLOR;
  bctx.fillRect(ANTENNA_X, ANTENNA_WALL_TOP, 1, ANTENNA_PIVOT - ANTENNA_WALL_TOP);

  const a = (tilt * Math.PI) / 180;
  const dx = Math.sin(a) * TILT_BACK[0];
  const dy = Math.sin(a) * TILT_BACK[1] - Math.cos(a);
  let prev = { x: ANTENNA_X, y: ANTENNA_PIVOT };
  for (let i = 1; i <= ANTENNA_PIVOT; i++) {
    const x = ANTENNA_X + Math.round(i * dx);
    const y = ANTENNA_PIVOT + Math.round(i * dy);
    // at an angle, two neighbors can end up a pixel apart: fill the gap with the pixel below
    if (Math.abs(x - prev.x) > 1 || Math.abs(y - prev.y) > 1) {
      bctx.drawImage(img, ANTENNA_X, ANTENNA_PIVOT - i + 1, 1, 1, Math.floor((x + prev.x) / 2), Math.floor((y + prev.y) / 2), 1, 1);
    }
    bctx.drawImage(img, ANTENNA_X, ANTENNA_PIVOT - i, 1, 1, x, y, 1, 1);
    prev = { x, y };
  }
  return prev;
}

// pulse thruster: rings launch from under her body, drift down, shrink and fade
let rings = [];
let step = 0;

function updateRings(bodyY, thrusterOn) {
  if (frame % STEP_FRAMES !== 0) return;
  step++;
  for (const ring of rings) {
    ring.age++;
    if (state.walking) ring.x += 0.5;
  }
  rings = rings.filter((ring) => ring.age < HOVER);
  const every = state.braking ? RING_EVERY_BRAKING : RING_EVERY;
  if (thrusterOn && step % every === 0) rings.push({ x: THRUSTER_X, y: bodyY + BODY_H, age: 0 });
}

// a 1-pixel oval, k pixels to each side and r pixels up and down
function pixelOval(cx, cy, k, r) {
  for (let dx = -k; dx <= k; dx++) {
    const dy = Math.round(r * Math.sqrt(Math.max(0, 1 - (dx / k) ** 2)));
    wctx.fillRect(cx + dx, cy - dy, 1, 1);
    if (dy !== 0) wctx.fillRect(cx + dx, cy + dy, 1, 1);
  }
}

function drawRings() {
  for (const ring of rings) {
    const t = ring.age / HOVER;
    const k = 7 - Math.round(t * 5);
    const r = k >= 6 ? 2 : 1;
    const [cr, cg, cb] = RING_COLORS[Math.min(RING_COLORS.length - 1, Math.floor(t * RING_COLORS.length))];
    wctx.globalAlpha = (1 - t) ** 0.6;
    wctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
    pixelOval(Math.round(ring.x), ring.y + ring.age, k, r);
  }
  wctx.globalAlpha = 1;
}

function drawNozzle(bodyY) {
  const y = bodyY + BODY_H;
  const hot = frame % 8 < 4 ? 'rgb(190, 255, 150)' : 'rgb(130, 240, 95)';
  NOZZLE_COLORS.forEach((color, i) => {
    wctx.fillStyle = color || hot;
    wctx.fillRect(THRUSTER_X - 2 + i, y, 1, 1);
  });
  // the thruster lights up the dark bottom edge of her body
  wctx.globalAlpha = 0.35;
  wctx.fillStyle = 'rgb(90, 220, 70)';
  wctx.fillRect(THRUSTER_X - 6, y - 1, 13, 1);
  wctx.globalAlpha = 1;
}

function draw() {
  if (state.thinking && !wasThinking) thinkStart = frame;
  wasThinking = state.thinking;
  updateHabits();
  updateTilt();

  const thrusterOn = (!state.falling || state.braking) && !state.dragging;
  const bob = thrusterOn ? Math.round(Math.sin(frame / 50)) : 0;
  const bodyY = TOP + bob;

  drawBody();
  updateRings(bodyY, thrusterOn);

  wctx.clearRect(0, 0, work.width, work.height);
  drawRings();
  wctx.drawImage(body, 0, bodyY);
  if (thrusterOn) drawNozzle(bodyY);

  // she's drawn facing left; facing right is the same drawing, mirrored
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.direction === 1) {
    ctx.save();
    ctx.translate(DRAW_X + DRAW_W, DRAW_Y);
    ctx.scale(-1, 1);
    ctx.drawImage(work, 0, 0, DRAW_W, DRAW_H);
    ctx.restore();
  } else {
    ctx.drawImage(work, DRAW_X, DRAW_Y, DRAW_W, DRAW_H);
  }

  frame++;
  requestAnimationFrame(draw);
}

// wait until every sprite has loaded, then start drawing
const allSprites = [sprites.body, ...sprites.thinking, ...sprites.alert, ...sprites.cool, ...sprites.drag];
Promise.all(allSprites.map((img) => img.decode()))
  .then(draw)
  .catch((err) => console.error('A sprite failed to load:', err));
