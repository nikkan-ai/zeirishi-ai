const express = require('express');
const line = require('@line/bot-sdk');
const { generateResponse } = require('../services/claude');
const db = require('../db/database');

const router = express.Router();

const userSessions = new Map();

const CATEGORIES = [
  { label: '📄 インボイス・帳簿', key: 'インボイス・帳簿', color: '#1A4A7A' },
  { label: '💰 経費・仕訳', key: '経費・仕訳', color: '#1A7A4A' },
  { label: '📊 確定申告・税務', key: '確定申告・税務', color: '#5A3A8A' },
  { label: '🏢 法人・給与', key: '法人・給与', color: '#7A4A1A' },
  { label: '💬 その他・顧問相談', key: 'その他', color: '#4A5A7A' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const CATEGORY_FAQS = {
  'インボイス・帳簿': [
    'インボイス登録番号の確認方法は？',
    '領収書の保存方法を教えてください',
    '電子帳簿保存法への対応は？',
    'インボイス非登録の取引先への対応は？',
  ],
  '経費・仕訳': [
    'この支出は経費になりますか？',
    '交際費の上限・処理方法は？',
    '自宅兼事務所の経費按分は？',
    '車・スマホの経費処理方法は？',
  ],
  '確定申告・税務': [
    '確定申告の時期と必要書類は？',
    '青色申告と白色申告の違いは？',
    '消費税の納税義務はありますか？',
    '税務調査が来た場合はどうすれば？',
  ],
  '法人・給与': [
    '役員報酬の決め方を教えてください',
    '給与と外注費の違いは何ですか？',
    '社会保険の加入義務はありますか？',
    '法人設立のメリット・タイミングは？',
  ],
  'その他': [
    '顧問契約について教えてください',
    '相談費用はいくらですか？',
    '記帳代行はお願いできますか？',
    '担当者に直接連絡したい',
  ],
};

const MENU_TRIGGER_WORDS = ['メニュー', 'menu', 'はじめまして', 'こんにちは', 'ヘルプ', 'help', '最初に戻る'];

function getLineConfig() {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  };
}

function buildMenuFlex(officeName, welcomeText) {
  return {
    type: 'flex',
    altText: 'ご相談メニュー',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#1A3A6A',
        contents: [
          { type: 'text', text: officeName, color: '#a8c8f0', size: 'sm' },
          { type: 'text', text: 'AI税務アシスタント', color: '#ffffff', size: 'xl', weight: 'bold', margin: 'xs' },
          { type: 'text', text: '税務・会計のご質問はこちらから', color: '#7aadd4', size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: welcomeText, wrap: true, size: 'sm', color: '#555555' },
          { type: 'separator', margin: 'lg', color: '#e0e0e0' },
          { type: 'text', text: 'ご相談内容をお選びください', weight: 'bold', size: 'md', margin: 'lg', color: '#1A3A6A' },
          ...CATEGORIES.map(cat => ({
            type: 'button',
            action: { type: 'message', label: cat.label, text: `【${cat.key}】` },
            style: 'primary',
            color: cat.color,
            margin: 'sm',
            height: 'sm',
          })),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '※税務判断の最終確認は担当税理士にお問い合わせください', size: 'xxs', color: '#aaaaaa', align: 'center', wrap: true },
        ],
        backgroundColor: '#f8f8f8',
      },
      styles: { footer: { separator: true } },
    },
  };
}

function buildCategoryFlex(category) {
  const cat = CATEGORY_MAP[category] || { color: '#1A4A7A' };
  const faqs = CATEGORY_FAQS[category] || [];
  const label = CATEGORIES.find(c => c.key === category)?.label || category;

  const faqButtons = faqs.map(q => ({
    type: 'button',
    action: { type: 'message', label: q.length > 20 ? q.substring(0, 19) + '…' : q, text: q },
    style: 'secondary',
    height: 'sm',
    margin: 'sm',
  }));

  return {
    type: 'flex',
    altText: `${category}についてご質問ください`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        backgroundColor: cat.color,
        contents: [
          { type: 'text', text: label, color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'よく聞かれる質問を選ぶか、自由に入力してください', color: '#FFFFFFBF', size: 'xxs', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'none',
        contents: [
          { type: 'text', text: 'よくある質問', weight: 'bold', size: 'xs', color: '#888888', margin: 'none' },
          { type: 'separator', margin: 'sm', color: '#e8e8e8' },
          ...faqButtons,
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            backgroundColor: '#f5f7fa',
            cornerRadius: '8px',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '💬 上記以外はメッセージで自由にご入力ください', size: 'xxs', color: '#888888', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '← メニューに戻る', text: 'メニュー' }, style: 'secondary', height: 'sm' },
        ],
      },
      styles: { footer: { separator: true } },
    },
  };
}

function buildResponseFlex(category, aiResponse) {
  const cat = CATEGORY_MAP[category];
  const headerColor = cat ? cat.color : '#1A3A6A';
  const headerLabel = cat ? CATEGORIES.find(c => c.key === category)?.label : '回答';

  return {
    type: 'flex',
    altText: aiResponse.substring(0, 50),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        paddingAll: '14px',
        backgroundColor: headerColor,
        contents: [
          { type: 'text', text: headerLabel || '回答', color: '#ffffff', weight: 'bold', size: 'sm', flex: 1 },
          { type: 'text', text: 'AI回答', color: '#ffffff88', size: 'xs', align: 'end' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: aiResponse, wrap: true, size: 'sm', color: '#333333', lineSpacing: '6px' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        paddingAll: '12px',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '続けて質問', text: `【${category || 'その他'}】` },
            style: 'primary',
            color: headerColor,
            height: 'sm',
            flex: 1,
          },
          {
            type: 'button',
            action: { type: 'message', label: 'メニューへ', text: 'メニュー' },
            style: 'secondary',
            height: 'sm',
            flex: 1,
          },
        ],
        backgroundColor: '#f8f8f8',
      },
      styles: { footer: { separator: true } },
    },
  };
}

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  const config = getLineConfig();
  const signature = req.headers['x-line-signature'];
  const body = req.body.toString('utf8');

  if (!line.validateSignature(body, config.channelSecret, signature)) {
    return res.status(403).send('Invalid signature');
  }

  const parsedBody = JSON.parse(body);
  const client = new line.Client(config);
  const events = parsedBody.events || [];

  Promise.all(events.map(event => handleEvent(event, client)))
    .then(() => res.json({ status: 'ok' }))
    .catch(err => {
      console.error('Webhook error:', err);
      res.status(500).send('Error');
    });
});

async function handleEvent(event, client) {
  const [officeName, welcomeMessage] = await Promise.all([
    db.getSetting('office_name'),
    db.getSetting('welcome_message'),
  ]);

  if (event.type === 'follow') {
    await client.replyMessage(event.replyToken, {
      type: 'flex',
      altText: 'ゼイリAIへようこそ！',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          backgroundColor: '#1A3A6A',
          contents: [
            { type: 'text', text: officeName, color: '#a8c8f0', size: 'sm' },
            { type: 'text', text: 'ゼイリAIへようこそ！', color: '#ffffff', size: 'xl', weight: 'bold', margin: 'xs' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          spacing: 'md',
          contents: [
            { type: 'text', text: 'このアカウントでは、税務・会計に関するご質問にAIが24時間お答えします。', wrap: true, size: 'sm', color: '#333333' },
            { type: 'separator', margin: 'md', color: '#e0e0e0' },
            {
              type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
              contents: [
                { type: 'text', text: '📄 インボイス・電帳法の対応', size: 'sm', color: '#444444' },
                { type: 'text', text: '💰 経費・仕訳の考え方', size: 'sm', color: '#444444' },
                { type: 'text', text: '📊 確定申告・消費税のご質問', size: 'sm', color: '#444444' },
                { type: 'text', text: '🏢 法人・給与・役員報酬', size: 'sm', color: '#444444' },
              ],
            },
            { type: 'separator', margin: 'md', color: '#e0e0e0' },
            { type: 'text', text: '下のメニューからカテゴリを選ぶか、直接メッセージを入力してください。', wrap: true, size: 'xs', color: '#888888', margin: 'md' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: '※税務判断の最終確認は担当税理士にお問い合わせください', size: 'xxs', color: '#aaaaaa', align: 'center', wrap: true },
          ],
          backgroundColor: '#f8f8f8',
        },
        styles: { footer: { separator: true } },
      },
    });
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  try {
    if (MENU_TRIGGER_WORDS.includes(userMessage)) {
      await client.replyMessage(event.replyToken, buildMenuFlex(officeName, welcomeMessage));
      return;
    }

    const categoryMatch = userMessage.match(/^【(.+)】$/);
    if (categoryMatch) {
      const category = categoryMatch[1];
      userSessions.set(userId, category);
      await client.replyMessage(event.replyToken, buildCategoryFlex(category));
      return;
    }

    const selectedCategory = userSessions.get(userId);
    const contextMessage = selectedCategory
      ? `[${selectedCategory}に関する質問] ${userMessage}`
      : userMessage;

    const aiResponse = await generateResponse(userId, contextMessage);
    await db.saveConversation(userId, userMessage, aiResponse);

    await client.replyMessage(event.replyToken, buildResponseFlex(selectedCategory, aiResponse));
  } catch (err) {
    console.error('Handle event error:', err);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ございません。一時的にエラーが発生しました。しばらくしてからもう一度お試しください。',
    });
  }
}

module.exports = router;
