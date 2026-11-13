const memory = require('../memory');

const definitions = [
    {
        name : 'remember',
        description : 'Save a lasting fact about Andres to long-term memory, so you still know it in future conversations. ' +
            'Use it when he asks you to remember something, or shares something clearly worth keeping ' +
            '(deadlines, plans, preferences, people in his life). Write the fact as one short sentence about Andres, ' +
            'and turn relative dates like "Thursday" into the actual date. Do not save small talk, ' +
            'and do not save something that is already in memory.',
    
        input_schema : {
            type : 'object',
            properties : {
                fact : {
                    type : 'string',
                    description : 'The fact to save, e.g. "Andres has an interview with John Deere on Thursday, November 12, 2026."'
                },
            },
            required : ['fact']
        },
    },
    {
    name: 'forget',
    description:
      'Remove a fact from long-term memory by its id (the number before each remembered fact). ' +
      'Use it when Andres asks you to forget something, or when a fact is no longer true.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The id of the fact to remove.' },
      },
      required: ['id'],
    },
  },
];


//run memory tool Claud requested and return result.
function run(name, input) {
  if (name === 'remember') {
    const fact = memory.remember(input.fact);
    return `Saved as fact ${fact.id}.`;
  }
  if (name === 'forget') {
    return memory.forget(input.id) ? `Forgot fact ${input.id}.` : `There is no fact ${input.id}.`;
  }
  return `Unknown tool: ${name}`;
}

module.exports = { definitions, run };