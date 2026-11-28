/**
 * Interactive 2-minute helper to obtain a permanent Google Drive OAuth Refresh Token
 * for automated background backups (`drive.file` scope only).
 */
import http from 'node:http';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { URL } from 'node:url';

const REDIRECT_URI = 'http://127.0.0.1:8789/callback';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    console.info('\n=== إعداد الربط التلقائي مع Google Drive لفرع وائل النظاري ===\n');
    const clientId = (await rl.question('1) أدخل Google OAuth Client ID: ')).trim();
    const clientSecret = (await rl.question('2) أدخل Google OAuth Client Secret: ')).trim();
    if (!clientId || !clientSecret) {
      throw new Error('Client ID و Client Secret مطلوبان.');
    }

    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
      }).toString();

    console.info('\n3) افتح الرابط التالي في المتصفح وسجّل الدخول بحساب Google Drive الخاص بالمحل:\n');
    console.info(authUrl + '\n');

    const code = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const u = new URL(req.url || '/', 'http://127.0.0.1:8789');
        if (u.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const authCode = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err || !authCode) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h2>فشلت المصادقة — أغلق النافذة وأعد المحاولة.</h2>');
          server.close();
          reject(new Error(err || 'Missing authorization code'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2 style="font-family:sans-serif;direction:rtl">تم الربط بنجاح! يمكنك إغلاق هذه الصفحة والعودة للطرفية.</h2>');
        server.close();
        resolve(authCode);
      });
      server.listen(8789, '127.0.0.1');
    });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson.refresh_token) {
      throw new Error(tokenJson.error_description || tokenJson.error || 'لم يتم إرجاع Refresh Token');
    }

    console.info('\n✅ تم استخراج المفاتيح بنجاح! انسخ السطور التالية إلى ملف local-edge/.env.edge:\n');
    console.info(`GDRIVE_CLIENT_ID=${clientId}`);
    console.info(`GDRIVE_CLIENT_SECRET=${clientSecret}`);
    console.info(`GDRIVE_REFRESH_TOKEN=${tokenJson.refresh_token}\n`);
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
