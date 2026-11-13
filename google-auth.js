const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');

// Sign-in for google
const DATA_DIR = path.join(__dirname, 'data');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const TOKEN_FILE = path.join(DATA_DIR, 'gmail-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

let client = null;

function loadSavedClient() {
    try {
        const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        return google.auth.fromJSON(token);
    } catch { 
        return null;
    }
}

// Refresh tokens
function saveToken(auth) {
    const keys = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    const key = keys.installed || keys.web;
    const token = {
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: auth.credentials.refresh_token,
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

async function getGoogleAuth() {
    if (client) return client;
    client = loadSavedClient();
    if (client) return client;

    // open browser to authenticate first time
    const auth = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_FILE });
    if (auth.credentials.refresh_token) saveToken(auth);
    client = auth;
    return client;
}

// forget the saved sign-in (Google expires it about weekly while the app is in Testing mode)
function signOut() {
  client = null;
  fs.rmSync(TOKEN_FILE, { force: true });
}

module.exports = { getGoogleAuth, signOut };