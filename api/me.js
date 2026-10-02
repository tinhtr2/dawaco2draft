// api/me.js — cho app biet ai dang dang nhap (app dung de tu chuyen sang AI chung)
import { userFromNodeReq } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await userFromNodeReq(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  return res.status(200).json({ user, ai: 'shared' });
}
