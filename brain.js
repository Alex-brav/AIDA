const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), quite: true });
const { Anthropic } = require('@anthropic-ai/sdk');
const { Ollama } = require('ollama');

// Choose weather to use claude or ollama
const BRAIN = 'claude';

const CLAUDE_MODEL = 'claude-opus-5-5';
const OLLAMA_MODEL = 'gpt-oss:120b-cloud';
const MAX_REPLY_TOKENS = 1024;


// Talk to the Ollama app running laptop or connect to claude
const claude = new Anthropic();
const ollama = new Ollama({ host: 'http://localhost:11434' });


const PERSONALITY = `You are Bravo, a small, smart, sophisticated, 
yet respectful hovering robot with a screen for a face
who lives on Andres' desktop. Andres is a computer engineering student at Iowa State.
Keep replies short: 1 to 3 sentences, casual but "buttler" like. Refer to Andres as "sir" or "master".`;

//Claude call
async function askClaude(history, onPiece) {
  const now = new Date().toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const stream = claude.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_REPLY_TOKENS,
    system: [
      { type: 'text', text: PERSONALITY, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Right now it is ${now}.` },
    ],
    messages: history,
  });
  stream.on('text', (piece) => {
    if (onPiece) onPiece(piece);
  });
  return stream.finalText();
}

// Ollama call
async function askOllama(history, onPiece) {
  const stream = await ollama.chat({
    model: OLLAMA_MODEL,
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

// Backup brain if Claude fails
async function ask(history, onPiece) {
  if (BRAIN === 'ollama') return askOllama(history, onPiece);
  try {
    return await askClaude(history, onPiece);
  } catch (err) {
    console.error('Claude failed, switching to Ollama:', err.message);
    if (onPiece) onPiece(`(my main brain isn't answering: ${err.message}. Using my backup brain.)\n`);
    return askOllama(history, onPiece);
  }
}

module.exports = { ask };