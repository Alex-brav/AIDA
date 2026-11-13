const { google } = require('googleapis');
const { getGoogleAuth } = require('../google-auth');

async function main() {
  const auth = await getGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const list = await gmail.users.messages.list({ userId: 'me', maxResults: 5 });
  for (const item of list.data.messages || []) {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: item.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From'],
    });
    const headers = Object.fromEntries(msg.data.payload.headers.map((h) => [h.name, h.value]));
    console.log(`- ${headers.Subject}  (from ${headers.From})`);
  }
}

main().catch((err) => console.error('Gmail test failed:', err.message));