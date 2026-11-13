const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const MAX_FACTS = 50;

let facts = load();

function load() {
    try {
        return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function save() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(facts, null, 2));
}

function nextId() { 
    return facts.reduce((max, f) => Math.max(max, f.id), 0) + 1;
}

function list() {
    return facts;
}

// direct function to add items to the fact list, drops the oldest fact.
function remember(text) {
    const fact = { id: nextId(), text: text.trim(), saved: new Date().toISOString().slice(0, 10) };
    facts.push(fact);
    if (facts.length > MAX_FACTS) facts.shift();
    save();
    return fact;
}

// direct function to remove items from the fact list by id
function forget(id) {
    const before = facts.length;
    facts = facts.filter(f => f.id !== id);
    save();
    return facts.length < before;
}   

function asPrompt() {
    if (facts.length === 0) return 'You have no saved memories yet';
    const lines = facts.map((f) => `${f.saved}: ${f.text} (saved ${f.saved})`);
    return `You remember this things: \n${lines.join('\n')}`;
}

module.exports = {
    list,
    remember,
    forget,
    asPrompt,
};