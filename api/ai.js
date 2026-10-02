// ============================================================
// api/ai.js — Ham serverless cho Vercel
// Muc dich: giu API key TREN MAY CHU (bien moi truong), nguoi dung
// mo app khong can nhap key nao.
//
// CAI DAT (lam 1 lan, xem HUONG_DAN_VERCEL.md):
//   1. Dat file nay vao thu muc "api" trong kho GitHub: api/ai.js
//   2. Tren Vercel > Project > Settings > Environment Variables, them:
//        OPENROUTER_API_KEY = sk-or-...     (neu dung OpenRouter - uu tien)
//        hoac GEMINI_API_KEY = AIza...      (neu dung Gemini)
//        hoac ANTHROPIC_API_KEY = sk-ant-...(neu dung Claude)
//      Tuy chon: AI_MODEL = ten model muon dung (mac dinh gemini-flash-latest)
//   3. Redeploy. Trong app chon che do "May chu trung gian /api/ai".
// ============================================================

import { usersConfigured, userFromNodeReq } from '../lib/auth.js';

export default async function handler(req, res) {
  // Chi cho phep POST
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ chấp nhận POST' });
  }
  // Lop bao ve thu 2 (ngoai middleware): da bat dang nhap thi bat buoc co phien hop le
  let who = 'khach';
  if (usersConfigured()) {
    who = await userFromNodeReq(req);
    if (!who) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn — hãy đăng nhập lại.' });
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const blocks = Array.isArray(body.blocks) ? body.blocks : [];
    const maxTokens = Math.min(Number(body.maxTokens) || 2000, 8000);
    if (!blocks.length) return res.status(400).json({ error: 'Thiếu nội dung yêu cầu.' });
    const nFiles = blocks.filter(b => b.kind !== 'text').length;
    console.log('[AI]', 'nguoi_dung=' + who, 'so_file=' + nFiles, 'do_dai=' + JSON.stringify(blocks).length);

    const OPENROUTER = process.env.OPENROUTER_API_KEY;
    const GEMINI = process.env.GEMINI_API_KEY;
    const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
    if (!OPENROUTER && !GEMINI && !ANTHROPIC) {
      return res.status(500).json({
        error: 'Máy chủ chưa được cấu hình API key. Người quản trị cần thêm OPENROUTER_API_KEY, GEMINI_API_KEY hoặc ANTHROPIC_API_KEY vào Environment Variables trên Vercel rồi Redeploy.'
      });
    }

    let text = '';
    if (OPENROUTER) {
      const model = process.env.AI_MODEL || await pickOpenRouterModel();
      const content = blocks.map((b, i) => {
        if (b.kind === 'text') return { type: 'text', text: b.text };
        const mime = b.mime || 'application/pdf';
        if (mime.startsWith('image/')) return { type: 'image_url', image_url: { url: `data:${mime};base64,${b.b64}` } };
        return { type: 'file', file: { filename: `tai-lieu-${i + 1}.pdf`, file_data: `data:${mime};base64,${b.b64}` } };
      });
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENROUTER}`, 'Content-Type': 'application/json', 'X-Title': 'Soan thao van ban 2 buoc' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: Math.min(Math.max(maxTokens * 4, 8192), 32768), temperature: 0.1 })
      });
      if (!r.ok) {
        const t = await r.text();
        const hint = r.status === 402 ? ' (tài khoản OpenRouter hết credit)' : '';
        return res.status(r.status).json({ error: `OpenRouter trả mã ${r.status}${hint}: ${t.slice(0, 200)}` });
      }
      const data = await r.json();
      const c = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      text = Array.isArray(c) ? c.map(x => x.text || '').join('\n') : (c || '');
    } else if (GEMINI) {
      const model = process.env.AI_MODEL || 'gemini-flash-latest'; // ban dai dien: luon theo model Flash moi nhat
      const parts = blocks.map(b =>
        b.kind === 'text'
          ? { text: b.text }
          : { inline_data: { mime_type: b.mime || 'application/pdf', data: b.b64 } }
      );
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { maxOutputTokens: Math.min(Math.max(maxTokens * 4, 8192), 32768), temperature: 0.1 }
          })
        }
      );
      if (!r.ok) {
        const t = await r.text();
        return res.status(r.status).json({ error: `Gemini trả mã ${r.status}: ${t.slice(0, 200)}` });
      }
      const data = await r.json();
      const cand = data.candidates && data.candidates[0];
      if (!cand || !cand.content || !cand.content.parts) {
        const blocked = data.promptFeedback && data.promptFeedback.blockReason;
        return res.status(502).json({ error: blocked ? `Gemini chặn nội dung (${blocked}).` : 'Gemini không trả về nội dung.' });
      }
      text = cand.content.parts.map(p => p.text || '').filter(Boolean).join('\n');
    } else {
      const model = process.env.AI_MODEL || 'claude-sonnet-4-6';
      const content = blocks.map(b => {
        if (b.kind === 'text') return { type: 'text', text: b.text };
        if ((b.mime || '').startsWith('image/')) {
          return { type: 'image', source: { type: 'base64', media_type: b.mime, data: b.b64 } };
        }
        return { type: 'document', source: { type: 'base64', media_type: b.mime || 'application/pdf', data: b.b64 } };
      });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(r.status).json({ error: `Claude trả mã ${r.status}: ${t.slice(0, 200)}` });
      }
      const data = await r.json();
      text = (data.content || []).map(c => (c.type === 'text' ? c.text : '')).filter(Boolean).join('\n');
    }

    if (!text) return res.status(502).json({ error: 'AI không trả về nội dung.' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi máy chủ trung gian: ' + (e && e.message ? e.message : String(e)) });
  }
}

// Tu chon model Gemini Flash moi nhat tren OpenRouter (khi khong dat AI_MODEL)
let OR_CACHED = null;
async function pickOpenRouterModel() {
  if (OR_CACHED) return OR_CACHED;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    const list = ((await r.json()).data || [])
      .map(m => m.id || '')
      .filter(id => /^google\/gemini/.test(id) && /flash/.test(id) && !/lite|tts|image|audio|live|batch|embedding|:free/.test(id));
    const rank = id => { const v = /gemini-(\d+)(?:\.(\d+))?/.exec(id); return (v ? (+v[1]) * 100 + (+(v[2] || 0)) : 0) * 10 - (/preview|exp/.test(id) ? 3 : 0); };
    list.sort((a, b) => rank(b) - rank(a));
    if (list.length) return (OR_CACHED = list[0]);
  } catch (e) {}
  return 'openrouter/auto';
}

// Cho phep tai lieu lon (PDF ma hoa base64)
export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };
