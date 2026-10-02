// api/logout.js — xoa cookie phien
import { clearCookie } from '../lib/auth.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearCookie());
  if (req.method === 'GET') { res.statusCode = 302; res.setHeader('Location', '/login.html'); return res.end(); }
  return res.status(200).json({ ok: true });
}
