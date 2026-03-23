const axios = require('axios');
const db = require('../db/database');

async function generateResponse(userId, userMessage) {
  const [systemPrompt, officeName, faqs, history] = await Promise.all([
    db.getSetting('system_prompt'),
    db.getSetting('office_name'),
    db.getFaqs(),
    db.getRecentHistory(userId, 5),
  ]);

  // FAQをシステムプロンプトに追加
  let fullSystemPrompt = `${systemPrompt}\n\n事務所名: ${officeName}\n\n【重要】回答はプレーンテキストで記述してください。マークダウン記法（*、**、#、##、- などの記号）は使わないでください。`;
  if (faqs.length > 0) {
    fullSystemPrompt += '\n\n【よくある質問と回答】\n';
    faqs.forEach(faq => {
      fullSystemPrompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
    });
  }

  // 会話履歴を構築
  const messages = [];
  history.forEach(h => {
    messages.push({ role: 'user', content: h.user_message });
    messages.push({ role: 'assistant', content: h.ai_response });
  });
  messages.push({ role: 'user', content: userMessage });

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: fullSystemPrompt,
      messages,
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  return response.data.content[0].text;
}

module.exports = { generateResponse };
