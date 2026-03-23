const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const db = require('../db/database');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Google認証開始
router.get('/auth/google', (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
  });
  res.redirect(url);
});

// Google認証コールバック
router.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/admin/sales?error=auth_failed');
  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    await db.setSetting('google_access_token', tokens.access_token);
    if (tokens.refresh_token) {
      await db.setSetting('google_refresh_token', tokens.refresh_token);
    }
    res.redirect('/admin/sales?gmail=connected');
  } catch (e) {
    console.error('Google auth error:', e);
    res.redirect('/admin/sales?error=auth_failed');
  }
});

// メール送信API
router.post('/admin/sales/send-email', async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).json({ error: '未ログイン' });
  const { to, body } = req.body;
  const subject = req.body.subject || '税理士・会計事務所様向けLINE AIサービス「ゼイリAI」のご紹介';
  if (!to || !body) return res.status(400).json({ error: 'to/bodyが必要です' });

  try {
    const accessToken = await db.getSetting('google_access_token');
    const refreshToken = await db.getSetting('google_refresh_token');
    if (!refreshToken) return res.status(400).json({ error: 'Gmail未連携。先にGoogle認証してください。', needAuth: true });

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

    // トークンリフレッシュ時に保存
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) await db.setSetting('google_access_token', tokens.access_token);
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // 実際の送信元アドレスを取得
    let senderEmail = 'me';
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      senderEmail = profile.data.emailAddress;
    } catch(e) { /* 取得失敗時はGmailのデフォルト */ }

    const message = [
      `From: =?UTF-8?B?${Buffer.from('桜井 謙司（合同会社エスコネクト）').toString('base64')}?= <${senderEmail}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      `List-Unsubscribe: <mailto:${senderEmail}?subject=unsubscribe>`,
      `Precedence: personal`,
      ``,
      Buffer.from(body).toString('base64'),
    ].join('\r\n');

    const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Gmail send error:', e);
    res.status(500).json({ error: 'メール送信に失敗しました: ' + e.message });
  }
});

module.exports = router;
