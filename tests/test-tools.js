const memoryTools = require('../tools/memory');
const memory = require('../memory');

console.log(memoryTools.definitions.map((t) => t.name));
console.log(memoryTools.run('remember', { fact: 'Andres is testing the memory tools' }));
console.log(memory.asPrompt());
console.log(memoryTools.run('forget', { id: 3 }));
console.log(memoryTools.run('forget', { id: 99 }));