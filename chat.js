const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');

// add a chat bubble
function addMessage(who, text) {
  const bubble = document.createElement('div');
  bubble.className = `msg ${who}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage('user', text);
  input.value = '';
  window.chat.send(text);
});

// A.I.D.A.'s reply arrives in pieces: start, then many pieces, then done
let replyBubble = null;
let gotText = false;

window.chat.onStart(() => {
  replyBubble = addMessage('aida', '...');
  replyBubble.classList.add('thinking');
  gotText = false;
  input.disabled = true;
});

window.chat.onPiece((piece) => {
  if (!piece) return;
  if (!gotText) {
    replyBubble.textContent = '';
    replyBubble.classList.remove('thinking');
    gotText = true;
  }
  replyBubble.textContent += piece;
  messages.scrollTop = messages.scrollHeight;
});

window.chat.onDone(() => {
  input.disabled = false;
  input.focus();
});

document.getElementById('close').addEventListener('click', () => window.chat.close());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.chat.close();
});

window.addEventListener('focus', () => input.focus());
