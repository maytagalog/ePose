
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const __dirname = path.resolve();
const TOKEN_PATH = path.join(__dirname, '../epose-poc/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../epose-poc/credentials/credentials.json');

async function getGmailClient() {
    //parse credential file
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    //check token
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const { client_secret, client_id } = credentials.installed;

    //process google auth
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
    oAuth2Client.setCredentials(token);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

function decodeGmailBase64Url(data: string): string {
    //parse base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

export async function getLastEmail(to: string, subjectContains: string) {
    const gmail = await getGmailClient();
    //check inbox
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: `to:${to} subject:${subjectContains}`,
        maxResults: 1,
    });

    //if no message return null
    if (!res.data.messages?.length) return null;


    const msgId = res.data.messages[0].id!;
    const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, });
    // console.log('Email fetched:', msg.data.payload?.mimeType );
    // console.log('Email headers:', msg.data.payload?.parts?.[0]?.body);
    // if (msg.data.payload?.mimeType !== 'text/html') {
    //     throw new Error(`Unsupported email mimeType: ${msg.data.payload?.mimeType}`);
    // }
    if (!msg.data.payload?.parts?.[0]?.body) {
        throw new Error('Email body is empty');
    }

    const body = decodeGmailBase64Url(msg.data.payload?.parts?.[0]?.body.data || '');

    return {
        subject: msg.data.payload?.headers?.find((h) => h.name === 'Subject')?.value,
        body,
    };
}

export async function waitForEmail(
    to: string,
    subjectContains: string,
    timeoutMs: number = 30000,
    intervalMs: number = 10000
): Promise<{ subject?: string | null | undefined; body: string } | null> {
    const deadline = Date.now() + timeoutMs;
    //deadline is already up
    while (Date.now() < deadline) {
        const email = await getLastEmail(to, subjectContains);
        if (email) return email;
        await new Promise((res) => setTimeout(res, intervalMs));
    }

    //throw error if email sending exceeds timeout
    throw new Error(`Timeout waiting for email to ${to} with subject containing "${subjectContains}"`);
}
