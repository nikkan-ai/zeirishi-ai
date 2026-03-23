const express = require('express');
const db = require('../db/database');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SIGNATURE = `桜井 謙司（合同会社エスコネクト）/ ゼイリAI: https://lp.sconnect.co.jp / info@lp.sconnect.co.jp`;

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/admin/login');
}

// ログイン画面
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const adminPassword = await db.getSetting('admin_password');
  if (password === adminPassword) {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.render('login', { error: 'パスワードが違います' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ダッシュボード
router.get('/', requireAuth, async (req, res) => {
  const [settings, conversations] = await Promise.all([
    db.getAllSettings(),
    db.getConversations(5),
  ]);
  res.render('dashboard', { settings, conversations });
});

// 設定更新
router.post('/settings', requireAuth, async (req, res) => {
  const { office_name, welcome_message, system_prompt, admin_password } = req.body;
  await Promise.all([
    db.setSetting('office_name', office_name),
    db.setSetting('welcome_message', welcome_message),
    db.setSetting('system_prompt', system_prompt),
    admin_password ? db.setSetting('admin_password', admin_password) : Promise.resolve(),
  ]);
  res.redirect('/admin?saved=1');
});

// FAQ一覧・追加
router.get('/faqs', requireAuth, async (req, res) => {
  const faqs = await db.getFaqs();
  res.render('faqs', { faqs });
});

router.post('/faqs', requireAuth, async (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) {
    await db.addFaq(question, answer);
  }
  res.redirect('/admin/faqs');
});

router.post('/faqs/delete', requireAuth, async (req, res) => {
  const { id } = req.body;
  await db.deleteFaq(id);
  res.redirect('/admin/faqs');
});

// 会話ログ
router.get('/logs', requireAuth, async (req, res) => {
  const conversations = await db.getConversations(100);
  res.render('logs', { conversations });
});

// 問い合わせ一覧
router.get('/inquiries', requireAuth, async (req, res) => {
  const inquiries = await db.getInquiries();
  res.render('inquiries', { inquiries });
});

// 営業先一括登録（初回のみ使用）
router.get('/sales/seed', requireAuth, async (req, res) => {
  const leads = [
    // CSVインポートで追加予定
  ];
  for (const l of leads) {
    await db.addOutreach(l.office, l.contact_name, l.email, l.notes);
  }
  res.redirect('/admin/sales');
});

// 営業支援
router.get('/sales', requireAuth, async (req, res) => {
  const leads = await db.getOutreach();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const followupCount = leads.filter(l => l.status === 'sent' && new Date(l.updated_at) <= sevenDaysAgo).length;
  res.render('sales', { leads, query: req.query, followupCount });
});

router.post('/sales/generate', requireAuth, async (req, res) => {
  const { office, contact_name, size, agent_type } = req.body;
  const axios = require('axios');

  const prompts = {
    cold_email: `以下のメールをそのまま送れる状態で書いてください。

送り手のプロフィール：
- 名前：桜井 謙司、合同会社エスコネクト代表、大阪在住
- 税理士・会計事務所向けのLINE AIサービス「ゼイリAI」を作った
- 以前、複数の税理士先生と話す中で「インボイス対応の問い合わせが急に増えて、同じことを何度も説明している」「電話もメールも対応が遅れがちで、顧問先に申し訳ない」という声を聞いて開発した

宛先：
- 事務所名: ${office}
- 担当者: ${contact_name || ''}

メールの書き方の指示：
- 件名から書くこと
- 宛名は「事務所名＋様」とする（例：○○税理士事務所様）。個人名は使わない
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 本文は260〜320文字。段落は2〜3つ
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 確定申告の繁忙期が落ち着いた今こそ、という時期感を自然な流れで一文触れる
- 開発の背景にある実体験（先生方から聞いた話）を1〜2文で丁寧に盛り込む
- ゼイリAIの説明として「顧問先からのLINE問い合わせをAIが24時間自動で一次対応・設定はこちらで全て対応・インボイスや電帳法など定型質問に強い」を押しつけがましくなく盛り込む
- 「AIは情報提供・一次対応に徹し、税務判断は先生が行う設計のため、顧問先への誤った案内のリスクもありません」という趣旨を自然な流れで一文入れる
- 「初月は完全無料でお試しいただけます」という一文を必ず本文に入れる。押しつけがましくならないよう自然な流れで
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名は書かない（システムが自動付与する）

【禁止事項】
- 箇条書き
- アスタリスク（*）・ハイフン区切り（---）などのマークダウン記号を一切使わない
- 「本文：」「署名：」などのラベル・見出し・区切り語を本文中に一切入れない（件名行は「件名: ○○」形式のみ）
- 「貴社」「益々のご発展」などの古い定型文
- 話し言葉・くだけた表現（「〜ですよね」「〜なんです」など）
- 「〜させていただく」「ご提供させていただく」などの二重敬語
- 「〜ではないでしょうか」「〜かもしれません」などの曖昧表現
- 同じ文型の繰り返し`,

    followup: `ゼイリAIの営業担当として、以下の事務所に1週間前に営業メールを送ったが返信がない状況です。
フォローアップメールを作成してください。

事務所名: ${office}
担当者名: ${contact_name || ''}

【要件】
- 件名も含めて出力
- 宛名は「事務所名＋様」とする（例：○○税理士事務所様）。個人名は使わない
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 二重敬語・マークダウン記号を使わない
- 150〜200文字程度（短く）
- 責めない・催促しない・あくまで確認ベース
- インボイス対応や電帳法対応の問い合わせが増えているという時代感を一文で自然に触れる
- 「初月は完全無料でお試しいただける」という点を一文で丁寧に添える
- 署名は書かない（システムが自動付与する）`,

    monitor: `以下のメールをそのまま送れる状態で書いてください。

送り手のプロフィール：
- 名前：桜井 謙司、合同会社エスコネクト代表、大阪在住
- 税理士・会計事務所向けのLINE AIサービス「ゼイリAI」を作った
- 先着5事務所限定で、導入・設定を完全無料でサポートするモニタープログラムを実施中

宛先：
- 事務所名: ${office}

メールの書き方の指示：
- 件名から書くこと
- 宛名は「事務所名＋様」とする（例：○○税理士事務所様）。個人名は使わない
- 全文をです・ます調で統一する
- 本文は240〜300文字。段落は2〜3つ
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 確定申告の繁忙期が落ち着いた今こそ、という時期感を自然な流れで一文触れる
- 開発の背景（税理士先生方から聞いたインボイス対応の負担感）を1〜2文で丁寧に盛り込む
- 「AIは情報提供・一次対応に徹し、税務判断は先生が行う設計のため安心してお使いいただけます」という趣旨を自然な流れで一文入れる
- 「先着5事務所限定の無料モニターを募集しています」という訴求を最も目立つ形で一文入れる
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名は書かない（システムが自動付与する）

【禁止事項】
- 箇条書き・マークダウン記号
- ラベル・見出し・区切り語（件名行は「件名: ○○」形式のみ）
- 「貴社」「益々のご発展」などの古い定型文
- 二重敬語・曖昧表現`,

    proposal: `ゼイリAIの営業担当として、以下の事務所に向けた提案書の本文を作成してください。

事務所名: ${office}
担当者名: ${contact_name || '先生'}
規模感: ${size || '不明'}

【要件】
- 課題の整理（インボイス・電帳法対応による問い合わせ急増・繰り返し対応の負担・時間外対応の難しさ）
- ゼイリAIで解決できること（顧問先からのLINE問い合わせを24時間AIが一次対応・定型質問の自動化・先生は申告と相談に集中できる）
- 料金プラン（ライト¥5,000・スタンダード¥10,000・プレミアム¥20,000、すべて月額・初月完全無料・設定おまかせ・いつでも解約可）
- AIは情報提供・取り次ぎに徹し、税務判断は先生が行うという設計思想を一文で明記
- 次のステップ（オンラインでの詳細説明・デモ日程調整）
- メール本文として使える文体で
- 箇条書き・マークダウン記号は使わない`,
  };

  const prompt = prompts[agent_type];
  if (!prompt) return res.json({ error: '不明なエージェントタイプです' });

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );
    let text = response.data.content[0].text.trim();
    if (agent_type === 'cold_email' || agent_type === 'followup' || agent_type === 'monitor') {
      text = text.replace(/桜井[^\n]*エスコネクト[^\n]*/g, '').replace(/info@lp\.sconnect\.co\.jp[^\n]*/g, '').trimEnd();
      text = `${text}\n\n${SIGNATURE}`;
    }
    res.json({ result: text });
  } catch (e) {
    res.json({ error: 'AI生成に失敗しました: ' + e.message });
  }
});

// 営業メール一括生成
router.get('/sales/generate-all', requireAuth, async (req, res) => {
  const axios = require('axios');
  const leads = await db.getOutreach();
  const allPending = leads.filter(l => l.status === 'pending');
  const MAX = 30;
  const pendingLeads = allPending.slice(0, MAX);

  const generateEmail = async (lead) => {
    const isForm = !lead.email;
    const prompt = `あなたは合同会社エスコネクトの桜井です。税理士・会計事務所向けにLINE AIサービス「ゼイリAI」を提供しています。
以下の事務所に送る営業文を書いてください。

事務所名: ${lead.office}
担当者名: ${lead.contact_name || ''}
所在地: ${lead.notes || ''}

【絶対に守ること】
- 全文をです・ます調で統一する
- 宛名は「事務所名＋様」とする（例：○○税理士事務所様）。個人名は使わない
- 話し言葉・くだけた表現を使わない
- 二重敬語を使わない
- 「お世話になっております」「貴社の益々のご発展」などの古い定型文を使わない
- マークダウン記号を一切使わない
- 「本文：」「署名：」などのラベル・見出しを入れない
${isForm
  ? '- 件名は不要。本文のみ出力する'
  : '- 最初の行に「件名: ○○」形式で件名を出力し、その後に本文を続ける'}
- 本文は220〜300文字
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 確定申告の繁忙期が落ち着いた今こそ、という時期感を自然な流れで一文触れる
- インボイス制度・電帳法対応で顧問先からの問い合わせが増えているという具体的なシーンに丁寧に触れる
- ゼイリAIの特徴として「LINEで自動応答・設定はこちらで対応・事務所ごとにカスタマイズ可能」をさりげなく盛り込む
- 「AIは情報提供・一次対応に徹し、税務判断は先生が行う設計のため安心してお使いいただけます」という趣旨を自然な流れで一文入れる
- 「初月は完全無料でお試しいただけます」という一文を必ず入れる
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名は書かない（システムが自動付与する）`;

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
      );
      const generated = response.data.content[0].text.trim();
      const withoutSig = generated.replace(/桜井[^\n]*エスコネクト[^\n]*/g, '').replace(/info@lp\.sconnect\.co\.jp[^\n]*/g, '').trimEnd();
      const finalEmail = `${withoutSig}\n\n${SIGNATURE}`;
      return { ...lead, generatedEmail: finalEmail };
    } catch (e) {
      return { ...lead, generatedEmail: '生成エラー: ' + e.message };
    }
  };

  const results = [];
  for (let i = 0; i < pendingLeads.length; i += 3) {
    const batch = pendingLeads.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(generateEmail));
    results.push(...batchResults);
    if (i + 3 < pendingLeads.length) await new Promise(r => setTimeout(r, 2000));
  }

  const remainingCount = allPending.length - pendingLeads.length;
  req.session.lastGeneratedEmails = { results, remainingCount };
  res.render('sales-emails', { results, pageTitle: '一括営業メール生成結果', remainingCount });
});

// 生成済みメールを再表示
router.get('/sales/view-emails', requireAuth, (req, res) => {
  const saved = req.session.lastGeneratedEmails;
  if (!saved) return res.redirect('/admin/sales/generate-all');
  res.render('sales-emails', { results: saved.results, pageTitle: '一括営業メール生成結果', remainingCount: saved.remainingCount });
});

// 一括送信API
router.post('/sales/send-all', async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).json({ error: '未ログイン' });
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: 'emailsが必要です' });

  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
  );
  const accessToken = await db.getSetting('google_access_token');
  const refreshToken = await db.getSetting('google_refresh_token');
  if (!refreshToken) return res.status(400).json({ error: 'Gmail未連携', needAuth: true });
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) await db.setSetting('google_access_token', tokens.access_token);
  });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let senderEmail = 'me';
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    senderEmail = profile.data.emailAddress;
  } catch(e) {}

  const results = [];
  for (const item of emails) {
    try {
      const subject = item.subject || '税理士事務所様向けLINE AIサービス「ゼイリAI」のご紹介';
      const message = [
        `From: =?UTF-8?B?${Buffer.from('桜井 謙司（合同会社エスコネクト）').toString('base64')}?= <${senderEmail}>`,
        `To: ${item.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        `List-Unsubscribe: <mailto:${senderEmail}?subject=unsubscribe>`,
        `Precedence: personal`,
        ``,
        Buffer.from(item.body).toString('base64'),
      ].join('\r\n');
      const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
      if (item.id) await db.updateOutreachStatus(item.id, 'sent', item.notes || '');
      results.push({ to: item.to, success: true });
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      results.push({ to: item.to, success: false, error: e.message });
    }
  }
  res.json({ results });
});

router.post('/sales/add', requireAuth, async (req, res) => {
  const { office, contact_name, email, notes } = req.body;
  await db.addOutreach(office, contact_name, email, notes);
  res.redirect('/admin/sales');
});

router.post('/sales/update', requireAuth, async (req, res) => {
  const { id, status, notes } = req.body;
  await db.updateOutreachStatus(id, status, notes);
  if (req.headers['x-requested-with'] === 'fetch') {
    return res.json({ success: true });
  }
  res.redirect('/admin/sales');
});

router.post('/sales/delete', requireAuth, async (req, res) => {
  await db.deleteOutreach(req.body.id);
  res.redirect('/admin/sales');
});

// フォローアップ一括生成（sent & 7日以上経過）
router.get('/sales/generate-followup', requireAuth, async (req, res) => {
  const axios = require('axios');
  const leads = await db.getOutreach();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const targetLeads = leads.filter(l => l.status === 'sent' && new Date(l.updated_at) <= sevenDaysAgo);

  if (targetLeads.length === 0) {
    return res.redirect('/admin/sales?followup_none=1');
  }

  const generateFollowup = async (lead) => {
    const prompt = `ゼイリAIの営業担当として、以下の事務所に1週間前に営業メールを送ったが返信がない状況です。
フォローアップメールを作成してください。

事務所名: ${lead.office}
担当者名: ${lead.contact_name || ''}

【要件】
- 件名も含めて出力
- 宛名は「事務所名＋様」とする（例：○○税理士事務所様）。個人名は使わない
- 全文をです・ます調で統一する
- 二重敬語・マークダウン記号を使わない
- 150〜200文字程度（短く）
- 責めない・催促しない・あくまで確認ベース
- インボイス対応の問い合わせが増えているという時代感を一文で自然に触れる
- 「初月は完全無料でお試しいただける」という点を一文で丁寧に添える
- 署名は書かない（システムが自動付与する）`;

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
      );
      const generated = response.data.content[0].text.trim();
      const withoutSig = generated.replace(/桜井[^\n]*エスコネクト[^\n]*/g, '').replace(/info@lp\.sconnect\.co\.jp[^\n]*/g, '').trimEnd();
      return { ...lead, generatedEmail: `${withoutSig}\n\n${SIGNATURE}` };
    } catch (e) {
      return { ...lead, generatedEmail: '生成エラー: ' + e.message };
    }
  };

  const results = [];
  for (let i = 0; i < targetLeads.length; i += 3) {
    const batch = targetLeads.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(generateFollowup));
    results.push(...batchResults);
    if (i + 3 < targetLeads.length) await new Promise(r => setTimeout(r, 2000));
  }

  res.render('sales-emails', { results, pageTitle: 'フォローアップメール一括生成' });
});

// CSV一括インポート
router.post('/sales/import-csv', requireAuth, upload.single('csvfile'), async (req, res) => {
  if (!req.file) return res.redirect('/admin/sales?error=no_file');
  try {
    const content = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    let added = 0, skipped = 0;
    const existing = await db.getOutreach();
    const existingEmails = new Set(existing.map(r => r.email).filter(Boolean));
    const existingOffices = new Set(existing.map(r => r.office));

    for (const row of records) {
      const office = row.office || row['事務所名'] || '';
      const email = row.email || row['メール'] || row['メールアドレス'] || '';
      const notes = row.notes || row.form_url || row['フォームURL'] || '';
      const contactName = row.name || row['担当者名'] || '';

      if (!office) { skipped++; continue; }
      if (existingOffices.has(office)) { skipped++; continue; }
      if (email && existingEmails.has(email)) { skipped++; continue; }

      await db.addOutreach(office, contactName, email, notes);
      existingOffices.add(office);
      if (email) existingEmails.add(email);
      added++;
    }

    res.redirect(`/admin/sales?import_added=${added}&import_skipped=${skipped}`);
  } catch (e) {
    console.error('CSV import error:', e);
    res.redirect('/admin/sales?error=import_failed');
  }
});

// 事務所名でHP URLを自動検索
router.post('/sales/find-hp', requireAuth, async (req, res) => {
  const axios = require('axios');
  const { id, office } = req.body;
  const query = encodeURIComponent(`${office} 税理士 公式サイト`);
  try {
    const r = await axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 8000,
    });
    const matches = r.data.match(/uddg=([^&"]+)/g) || [];
    const urls = matches
      .map(m => decodeURIComponent(m.replace('uddg=', '')))
      .filter(u => u.startsWith('http') && !u.includes('duckduckgo') && !u.includes('google'));
    const url = urls[0] || null;
    if (url && id) {
      await db.updateOutreachNotesById(id, url);
    }
    res.json({ url });
  } catch(e) {
    res.json({ url: null });
  }
});

module.exports = router;
