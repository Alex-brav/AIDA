const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), quiet: true });
const { Anthropic } = require('@anthropic-ai/sdk');
const { Ollama } = require('ollama');
const memory = require('./memory');
const conversation = require('./conversation');
const expression = require('./expression');

// tools:
const memoryTools = require('./tools/memory');
const gmailTools = require('./tools/gmail');


const BRAIN = 'claude'; // Choose whether to use claude or ollama

const CLAUDE_MODEL = 'claude-opus-5-5';
const OLLAMA_MODEL = 'gpt-oss:120b-cloud';
const MAX_REPLY_TOKENS = 1024;
const MAX_TOOL_ROUNDS = 5;

// Talk to the Ollama app running laptop or connect to claude
const claude = new Anthropic();
const ollama = new Ollama({ host: 'http://localhost:11434' });

const PERSONALITY = fs.readFileSync(path.join(__dirname, 'personality.md'), 'utf8');

// every tool Bravo can use. Gmail and home control will be added to this list later.
const toolSets = [memoryTools, gmailTools];
const tools = toolSets.flatMap((set) => set.definitions);

function now() {
  return new Date().toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// personality and memory
function systemBlocks() {
  return [
    { type: 'text', text: PERSONALITY },
    { type: 'text', text: expression.asPrompt() },
    { type: 'text', text: memory.asPrompt(), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Right now it is ${now()}.` },
  ];
}

// run the tool Claude asked for. If it breaks, tell Claude instead of crashing.
async function runTool(name, input) {
  const set = toolSets.find((s) => s.definitions.some((d) => d.name === name));
  if (!set) return `Unknown tool: ${name}`;
  try {
    return await set.run(name, input);
  } catch (err) {
    return `The tool failed: ${err.message}`;
  }
}

// Claude call, with tools
async function askClaude(history, onPiece, onAction) {
  const messages = [...history];
  let reply = '';
  const push = expression.createTagReader((piece) => {
    reply += piece;
    if (onPiece) onPiece(piece);
  }, onAction);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = claude.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_REPLY_TOKENS,
      system: systemBlocks(),
      tools,
      messages,
    });
    stream.on('text', push);
    const message = await stream.finalMessage();

    if (message.stop_reason !== 'tool_use') return reply;

    // keep his request in the conversation, run each tool, and send back the results
    messages.push({ role: 'assistant', content: message.content });
      const results = [];
      for (const block of message.content) {
        if (block.type !== 'tool_use') continue;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: await runTool(block.name, block.input) });
      }
    messages.push({ role: 'user', content: results });
  }
  return reply;
}

// Ollama call (but has no tools to change it)
async function askOllama(history, onPiece, onAction) {
  const system = `${PERSONALITY}\n\n${expression.asPrompt()}\n\n${memory.asPrompt()}\n\nRight now it is ${now()}.`;
  let reply = '';
  const push = expression.createTagReader((piece) => {
    reply += piece;
    if (onPiece) onPiece(piece);
  }, onAction);

  const stream = await ollama.chat({
    model: OLLAMA_MODEL,
    messages: [{ role: 'system', content: system }, ...history],
    stream: true,
  });
  for await (const part of stream) push(part.message.content);
  return reply;
}

// Backup brain if Claude fails
async function ask(history, onPiece, onAction) {
  if (BRAIN === 'ollama') return askOllama(history, onPiece, onAction);
  try {
    return await askClaude(history, onPiece, onAction);
  } catch (err) {
    console.error('Claude failed, switching to Ollama:', err.message);
    if (onPiece) onPiece(`(my main brain isn't answering: ${err.message}. Using my backup brain.)\n`);
    return askOllama(history, onPiece, onAction);
  }
}

async function chat(text, onPiece, onAction) {
  const history = [...conversation.recent(), { role: 'user', content: text }];
  const reply = await ask(history, onPiece, onAction);
  if (reply.trim()) conversation.addExchange(text, reply);
  return reply;
}


module.exports = { ask, chat };