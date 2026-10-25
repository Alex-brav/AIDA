const { Ollama } = require('ollama');

// Talk to the Ollama app running laptop
const ollama = new Ollama({ host: 'http://localhost:11434' });

const MODEL = 'gpt-oss:120b-cloud';

const PERSONALITY = `You are A.I.D.A. (AI Desktop Assistant), a small, friendly blue triceratops
who lives on Andres' desktop. Andres is a computer engineering student at Iowa State.
Keep replies short: 1 to 3 sentences, casual and a little playful.`;

// Send the conversation so far, get A.I.D.A.'s reply.
// history: [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }, ...]
async function ask(history, onPiece) {
  const stream = await ollama.chat({
    model: MODEL,
    messages: [{ role: 'system', content: PERSONALITY }, ...history],
    stream: true,
  });

  let reply = '';
  for await (const part of stream) {
    const piece = part.message.content;
    reply += piece;
    if (onPiece) onPiece(piece);
  }
  return reply;
}

module.exports = { ask };