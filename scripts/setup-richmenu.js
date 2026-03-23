#!/usr/bin/env node
require('dotenv').config();

const axios = require('axios');
const { createCanvas } = require('canvas');

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const W = 2500;
const H = 1686; // フルサイズ（上部イラスト + 下部ボタン）
const HEADER_H = 600; // イラストエリアの高さ
const BTN_Y = HEADER_H;
const BTN_H = H - HEADER_H;

const AREAS = [
  { x: 0,    y: BTN_Y, w: 834,  h: BTN_H / 2, key: '労務管理', emoji: '👔', label: '労務管理',  sub: '就業規則・労働時間', bg: '#1B4F72', accent: '#2E86C1' },
  { x: 834,  y: BTN_Y, w: 833,  h: BTN_H / 2, key: '社会保険', emoji: '🏥', label: '社会保険',  sub: '健康保険・年金',     bg: '#145A32', accent: '#1E8449' },
  { x: 1667, y: BTN_Y, w: 833,  h: BTN_H / 2, key: '雇用保険', emoji: '📋', label: '雇用保険',  sub: '失業給付・手続き',   bg: '#4A235A', accent: '#7D3C98' },
  { x: 0,    y: BTN_Y + BTN_H / 2, w: 1250, h: BTN_H / 2, key: '給与計算', emoji: '💴', label: '給与計算',  sub: '賃金・残業代計算',   bg: '#6E2F0A', accent: '#CA6F1E' },
  { x: 1250, y: BTN_Y + BTN_H / 2, w: 1250, h: BTN_H / 2, key: 'その他',   emoji: '💬', label: 'その他相談', sub: 'なんでもご相談を',   bg: '#1A2E40', accent: '#2E6DA4' },
];

function drawHeader(ctx) {
  // 背景グラデーション（明るくポップに）
  const grad = ctx.createLinearGradient(0, 0, W, HEADER_H);
  grad.addColorStop(0,   '#1a3a5c');
  grad.addColorStop(0.5, '#2d6a9f');
  grad.addColorStop(1,   '#1a3a5c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER_H);

  // 装飾円（背景）
  const circles = [
    { x: 180,  y: 120,  r: 220, color: 'rgba(255,255,255,0.04)' },
    { x: 2320, y: 80,   r: 180, color: 'rgba(255,255,255,0.04)' },
    { x: 1250, y: 580,  r: 300, color: 'rgba(255,255,255,0.03)' },
    { x: 600,  y: 500,  r: 150, color: 'rgba(100,180,255,0.08)' },
    { x: 1900, y: 450,  r: 200, color: 'rgba(100,180,255,0.06)' },
  ];
  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
  }

  // 左側：キャラクターアイコン群（社労士っぽいポップなアイコン）
  const icons = [
    { emoji: '🏢', x: 200,  y: 160, size: 160 },
    { emoji: '📊', x: 420,  y: 260, size: 120 },
    { emoji: '👨‍💼', x: 160,  y: 370, size: 140 },
    { emoji: '📝', x: 370,  y: 430, size: 100 },
    { emoji: '🤝', x: 560,  y: 180, size: 110 },
  ];
  for (const icon of icons) {
    ctx.font = `${icon.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.emoji, icon.x, icon.y);
  }

  // 右側：アイコン群
  const iconsR = [
    { emoji: '👩‍💼', x: 2300, y: 170, size: 150 },
    { emoji: '📅', x: 2080, y: 280, size: 120 },
    { emoji: '💡', x: 2330, y: 390, size: 130 },
    { emoji: '✅', x: 2080, y: 440, size: 100 },
    { emoji: '🔒', x: 1920, y: 180, size: 110 },
  ];
  for (const icon of iconsR) {
    ctx.font = `${icon.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.emoji, icon.x, icon.y);
  }

  // 中央：メインテキスト
  // タイトル背景カプセル
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, 750, 120, 1000, 130, 65);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('社労士 AI アシスタント', W / 2, 185);

  // サブタイトル
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '48px sans-serif';
  ctx.fillText('労務・社会保険のご相談はこちら', W / 2, 290);

  // バッジ（24時間対応など）
  const badges = ['💬 いつでも相談OK', '⚡ すぐに回答', '🔒 安心・安全'];
  badges.forEach((badge, i) => {
    const bx = W / 2 - 520 + i * 520;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, bx - 180, 370, 360, 80, 40);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, bx, 410);
  });

  // 下部の矢印ガイド
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '38px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▼  相談したいカテゴリをタップ  ▼', W / 2, 530);

  // 区切り線（波線風）
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H - 1);
  ctx.lineTo(W, HEADER_H - 1);
  ctx.stroke();
}

function drawButtons(ctx) {
  for (const area of AREAS) {
    const { x, y, w, h, bg, accent, emoji, label, sub } = area;

    // 背景グラデーション
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, shadeColor(bg, -25));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // アクセントライン（上部）
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 8);

    // アイコン背景の円
    const cx = x + w / 2;
    const cy = y + h * 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.fill();

    // 絵文字
    ctx.font = '140px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);

    // ラベルテキスト
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(label, cx, y + h * 0.72);

    // サブテキスト
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '38px sans-serif';
    ctx.fillText(sub, cx, y + h * 0.88);

    // 枠線
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shadeColor(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + percent));
  const b = Math.max(0, Math.min(255, (n & 0xff) + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function createMenuImage() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawHeader(ctx);
  drawButtons(ctx);
  return canvas.toBuffer('image/png');
}

const api = axios.create({
  baseURL: 'https://api.line.me/v2/bot',
  headers: { Authorization: `Bearer ${TOKEN}` },
});

async function setup() {
  console.log('🎨 リッチメニュー画像を生成中...');
  const imageBuffer = createMenuImage();
  console.log(`   画像サイズ: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  try {
    const { data } = await api.get('/richmenu/list');
    for (const menu of data.richmenus || []) {
      await api.delete(`/richmenu/${menu.richMenuId}`);
      console.log(`🗑️  既存メニュー削除: ${menu.richMenuId}`);
    }
  } catch (e) {}

  console.log('📋 リッチメニューを作成中...');
  const { data: created } = await api.post('/richmenu', {
    size: { width: W, height: H },
    selected: true,
    name: '相談メニュー',
    chatBarText: '📋 相談メニューを開く',
    areas: AREAS.map(area => ({
      bounds: { x: area.x, y: area.y, width: area.w, height: area.h },
      action: { type: 'message', text: `【${area.key}】` },
    })),
  });
  const richMenuId = created.richMenuId;
  console.log(`   作成完了: ${richMenuId}`);

  console.log('🖼️  画像をアップロード中...');
  await axios.post(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    imageBuffer,
    { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' } }
  );

  await api.post(`/user/all/richmenu/${richMenuId}`);
  console.log('✅ 完了！LINEアプリでチャットを開くと新しいメニューが表示されます。');
}

setup().catch(err => {
  console.error('❌ エラー:', err.response?.data || err.message);
  process.exit(1);
});
