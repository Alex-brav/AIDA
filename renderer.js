const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const SCALE = 1.5; 
const SPRITE = 48 * SCALE;
const SPRITE_X = (canvas.width - SPRITE) / 2;
const FEET_ROW = 39;
const GROUND_Y = canvas.height - FEET_ROW * SCALE;
const FALL_FEET_ROW = 43;
const FALL_Y = canvas.height - FALL_FEET_ROW * SCALE;

const WAG_SPEED = 10; 
const WAG_AMOUNT = 2;

let state = { walking: false, direction: -1, dragging: false, falling: false };
let hopHeight = 0; 
let frame = 0;

window.aida.onState((s) => { state = s; });
window.aida.onHop((h) => { hopHeight = h; });

// grab and drop
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) window.aida.dragStart();
});
window.addEventListener('mouseup', () => window.aida.dragEnd());

function load(name) {
  const img = new Image();
  img.src = `assets/sprites/${name}.png`;
  return img;
}

// Which image is used for which pose. Change a path here to swap a sprite.
const sprites = {
  standing: { east: load('idle/east'), west: load('idle/west') },
  jump:     { east: load('jump/east'), west: load('jump/west') },
  falling:  { east: load('falling/south-east'), west: load('falling/south-west') },
  dragging: load('falling/north'),
};

// Where the tail is in each sprite (pixels in the 48x48 image).
//   axis 'x' = tail sticks out sideways, wags up and down
//   axis 'y' = tail points up or down, wags left and right
//   root/tip = where the tail starts and ends along that axis
//   band     = the strip of pixels across the tail: [first pixel, how many]
const tails = {
  standing: {
    east: { axis: 'x', root: 10, tip: 0, band: [22, 10] },
    west: { axis: 'x', root: 37, tip: 47, band: [22, 10] },
  },
  jump: {
    east: { axis: 'x', root: 9, tip: 0, band: [21, 10] },
    west: { axis: 'x', root: 37, tip: 47, band: [22, 9] },
  },
  falling: {
    east: { axis: 'y', root: 16, tip: 4, band: [7, 9] },
    west: { axis: 'y', root: 16, tip: 4, band: [33, 9] },
  },
  dragging: { axis: 'y', root: 37, tip: 47, band: [20, 11] },
};

// Where the eye is in the standing sprites (top-left pixel of the 2x2 eye)
const eyes = {
  east: { x: 35, y: 22 },
  west: { x: 11, y: 22 },
};
const BODY_COLOR = 'rgb(27, 59, 114)'; 

// small 48x48 scratch canvas where the current sprite is rebuilt every frame
const work = document.createElement('canvas');
work.width = 48;
work.height = 48;
const wctx = work.getContext('2d');

// draw a sprite with its tail wagging. strength: 0 = still, 1 = full wag
function drawWithTail(img, tail, strength) {
  wctx.clearRect(0, 0, 48, 48);
  wctx.drawImage(img, 0, 0);
  if (strength <= 0) return;

  const start = Math.min(tail.root, tail.tip);
  const length = Math.abs(tail.tip - tail.root) + 1;
  const [bandStart, bandSize] = tail.band;

  // erase the tail, then redraw it one pixel strip at a time, each strip shifted a bit
  if (tail.axis === 'x') wctx.clearRect(start, bandStart, length, bandSize);
  else wctx.clearRect(bandStart, start, bandSize, length);

  for (let i = start; i < start + length; i++) {
    const weight = Math.abs(i - tail.root) / (length - 1); 
    const shift = Math.round(Math.sin(frame / WAG_SPEED - weight * 2) * WAG_AMOUNT * weight * strength);
    if (tail.axis === 'x') {
      wctx.drawImage(img, i, bandStart, 1, bandSize, i, bandStart + shift, 1, bandSize);
    } else {
      wctx.drawImage(img, bandStart, i, bandSize, 1, bandStart + shift, i, bandSize, 1);
    }
  }
}

function closeEye(side) {
  wctx.fillStyle = BODY_COLOR;
  wctx.fillRect(eyes[side].x, eyes[side].y, 2, 1); 
}


function pickPose() {
  const side = state.direction === 1 ? 'east' : 'west';

  if (state.dragging) {
    drawWithTail(sprites.dragging, tails.dragging, 1);
    return canvas.height - SPRITE;
  }
  if (state.falling) {
    drawWithTail(sprites.falling[side], tails.falling[side], 1);
    return FALL_Y;
  }
  if (state.walking || hopHeight < 0) {
    const inAir = hopHeight < -2;
    const pose = inAir ? 'jump' : 'standing';
    drawWithTail(sprites[pose][side], tails[pose][side], 1);
    return GROUND_Y + hopHeight;
  }

  const burst = Math.max(0, Math.sin(frame / 90));
  drawWithTail(sprites.standing[side], tails.standing[side], burst);
  if (frame % 200 < 8) closeEye(side); 
  return GROUND_Y;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const y = pickPose();  
  ctx.drawImage(work, SPRITE_X, Math.round(y), SPRITE, SPRITE);

  frame++;
  requestAnimationFrame(draw);
}

const allSprites = [
  ...Object.values(sprites.standing),
  ...Object.values(sprites.jump),
  ...Object.values(sprites.falling),
  sprites.dragging,
];
Promise.all(allSprites.map((img) => img.decode()))
  .then(draw)
  .catch((err) => console.error('A sprite failed to load:', err));
