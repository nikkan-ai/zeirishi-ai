const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faqs (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      office TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      plan TEXT,
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outreach (
      id SERIAL PRIMARY KEY,
      office TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_message TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // デフォルト設定
  const defaults = [
    ['office_name', '〇〇社会保険労務士事務所'],
    ['welcome_message', 'こんにちは！AIアシスタントです。労務・社会保険に関するご質問にお答えします。'],
    ['system_prompt', 'あなたは社会保険労務士事務所のAIアシスタントです。労務管理、社会保険、雇用保険、給与計算などに関する一般的な質問にわかりやすく答えてください。複雑な個別案件や法的判断が必要な場合は「担当の先生にご確認ください」と案内してください。'],
    ['admin_password', 'admin123'],
  ];

  for (const [key, value] of defaults) {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }
}

initDb().catch(err => console.error('DB初期化エラー:', err));

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value]
  );
}

async function getAllSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  return settings;
}

async function addFaq(question, answer) {
  await pool.query('INSERT INTO faqs (question, answer) VALUES ($1, $2)', [question, answer]);
}

async function getFaqs() {
  const { rows } = await pool.query('SELECT * FROM faqs ORDER BY created_at DESC');
  return rows;
}

async function deleteFaq(id) {
  await pool.query('DELETE FROM faqs WHERE id = $1', [id]);
}

async function saveConversation(userId, userMessage, aiResponse) {
  await pool.query(
    'INSERT INTO conversations (user_id, user_message, ai_response) VALUES ($1, $2, $3)',
    [userId, userMessage, aiResponse]
  );
}

async function getConversations(limit = 50) {
  const { rows } = await pool.query(
    'SELECT * FROM conversations ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}

async function getRecentHistory(userId, limit = 5) {
  const { rows } = await pool.query(
    'SELECT user_message, ai_response FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows.reverse();
}

async function saveInquiry(office, name, email, plan, message) {
  await pool.query(
    'INSERT INTO inquiries (office, name, email, plan, message) VALUES ($1, $2, $3, $4, $5)',
    [office, name, email, plan, message]
  );
}

async function getInquiries() {
  const { rows } = await pool.query('SELECT * FROM inquiries ORDER BY created_at DESC');
  return rows;
}

async function addOutreach(office, contactName, email, notes) {
  const { rows } = await pool.query(
    'INSERT INTO outreach (office, contact_name, email, notes) VALUES ($1, $2, $3, $4) RETURNING id',
    [office, contactName, email, notes]
  );
  return rows[0].id;
}

async function getOutreach() {
  const { rows } = await pool.query('SELECT * FROM outreach ORDER BY updated_at DESC');
  return rows;
}

async function updateOutreachStatus(id, status, notes) {
  await pool.query(
    'UPDATE outreach SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
    [status, notes, id]
  );
}

async function deleteOutreach(id) {
  await pool.query('DELETE FROM outreach WHERE id = $1', [id]);
}

async function updateOutreachNotes(office, notes) {
  await pool.query(
    'UPDATE outreach SET notes = $1 WHERE office = $2',
    [notes, office]
  );
}

async function updateOutreachNotesById(id, notes) {
  await pool.query('UPDATE outreach SET notes = $1 WHERE id = $2', [notes, id]);
}

module.exports = {
  getSetting, setSetting, getAllSettings,
  addFaq, getFaqs, deleteFaq,
  saveConversation, getConversations, getRecentHistory,
  saveInquiry, getInquiries,
  addOutreach, getOutreach, updateOutreachStatus, deleteOutreach, updateOutreachNotes, updateOutreachNotesById,
};
