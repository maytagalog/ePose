import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { google } from 'googleapis';

const __dirname = path.resolve();
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../epose-poc/credentials/credentials.json');

async function loadSavedCredentialsIfExist() {
    try {
        //check if credentials exist
        const content = fs.readFileSync(TOKEN_PATH, 'utf8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

async function saveCredentials(client: any) {
    // navigate to the credential file
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    //parse file content
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    // transform it object to string
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    // write fil
    fs.writeFileSync(TOKEN_PATH, payload);
}

async function authorize() {
    // checks if token file already exists
    let client = await loadSavedCredentialsIfExist();
    //if exists, return
    if (client) {
        console.log('Token already exists');
        return client;
    }

    //open create/read credential file
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    //parse file content to JSON
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    // call auth
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    //generates auth url
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('Authorize this app by visiting:', authUrl);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    //enters code from auth url and saves it to the token file
    rl.question('Enter the code from that page here: ', async (code) => {
        rl.close();
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        await saveCredentials(oAuth2Client);
        console.log('Token saved to', TOKEN_PATH);
    });
}

authorize();