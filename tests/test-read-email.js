const gmailTools = require('../tools/gmail');

async function main() {
  const found = await gmailTools.run('search_emails', { query: 'in:inbox', max_results: 1 });
  const id = found.match(/^id: (\S+)/m)?.[1];
  console.log('newest email id:', id);
  const result = await gmailTools.run('read_email', { id });
  console.log(result.slice(0, 400));
}

main();