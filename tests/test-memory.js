const memory = require('../memory');

memory.remember('Andres has a career fair on September 16');
memory.remember('Andres prefers to be called sir');
console.log(memory.asPrompt());