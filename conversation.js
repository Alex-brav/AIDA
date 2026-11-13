const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversation.json');
const MAX_MESSAGES = 20;

let messages = load();

function load() {
    try {
        return JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8'));
    } catch {
        return [];
    }   
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONVERSATION_FILE, JSON.stringify(messages, null, 2));
}

function recent() {
  return messages;
}

function addExchange(userText, replyText) {
  messages.push({ role: 'user', content: userText }, { role: 'assistant', content: replyText });
  if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
  save();
}

function clear() {
  messages = [];
  save();
}

module.exports = { recent, addExchange, clear };