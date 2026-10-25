const { ask } = require('./brain');

const history = [{ role: 'user', content: 'Hi! Who are you?' }];

ask(history, (piece) => process.stdout.write(piece))
  .then(() => console.log('\n--- done'))
  .catch((err) => console.error('Something went wrong:', err.message));