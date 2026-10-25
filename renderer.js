const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
let frame = 0;

// This is a generated place holder for later graphics.

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bob = Math.sin(frame / 10) * 4;   // gentle up-and-down
  const blinking = frame % 180 < 6;       // blink about every 3 seconds

  // body
  ctx.fillStyle = '#4f8cff';
  ctx.beginPath();
  ctx.roundRect(50, 80 + bob, 100, 100, 30);
  ctx.fill();

  // eyes
  ctx.fillStyle = '#ffffff';
  const eyeH = blinking ? 2 : 14;
  const eyeY = 115 + bob + (blinking ? 6 : 0);
  ctx.fillRect(75, eyeY, 12, eyeH);
  ctx.fillRect(113, eyeY, 12, eyeH);

  frame++;
  requestAnimationFrame(draw);
}

draw();