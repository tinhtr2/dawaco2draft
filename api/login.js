// api/login.js — kiem tra ten + mat khau, cap cookie phien (HttpOnly)
import { checkPassword, makeToken, sessionCookie, usersConfigured } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ chấp nhận POST' });
  if (!usersConfigured()) return res.status(503).json({ error: 'Quản trị chưa khai báo danh sách tài khoản (USERS) trên Vercel.' });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { body = {}; }
  const name = await checkPassword(body && body.username, body && body.password);
  if (!name) {
    await new Promise(r => setTimeout(r, 900));   // lam cham do mat khau
    console.log('[DANG NHAP THAT BAI]', String((body && body.username) || '').slice(0, 40));
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  const { token, maxAge } = await makeToken(name);
  res.setHeader('Set-Cookie', sessionCookie(token, maxAge));
  console.log('[DANG NHAP]', name);
  return res.status(200).json({ ok: true, user: name });
}
