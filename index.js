require('dotenv').config();

const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', './views');

// webhookルートはexpress.json()より先に登録（raw bodyが必要なため）
const webhookRouter = require('./routes/webhook');
app.use('/webhook', webhookRouter);

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'sharoushi-ai-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1日
}));

// 管理画面ルート
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);

// Gmail OAuth・送信ルート
const gmailRouter = require('./routes/gmail');
app.use('/', gmailRouter);

// トップページ → ランディングページ
app.get('/', (req, res) => res.sendFile('index.html', { root: './public' }));
app.get('/privacy', (req, res) => res.sendFile('privacy.html', { root: './public' }));
app.get('/terms', (req, res) => res.sendFile('terms.html', { root: './public' }));
app.get('/company', (req, res) => res.sendFile('company.html', { root: './public' }));
app.get('/contract-template', (req, res) => res.sendFile('contract-template.html', { root: './public' }));
app.get('/onboarding-guide', (req, res) => res.sendFile('onboarding-guide.html', { root: './public' }));

// お問い合わせ受付
const db = require('./db/database');
app.post('/inquiry', async (req, res) => {
  const { office, name, email, plan, message } = req.body;
  if (!office || !name || !email) return res.status(400).send('必須項目が不足しています');
  await db.saveInquiry(office, name, email, plan, message);
  res.sendFile('thanks.html', { root: './public' });
});

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
  console.log(`管理画面: http://localhost:${PORT}/admin`);
});
