// ============================================================
// lib/auth.js — xac thuc dung chung cho middleware va cac ham /api
// Chay duoc tren ca Edge (middleware) va Node.js (ham /api):
// chi dung Web Crypto + btoa/atob, khong dung thu vien ngoai.
//
// Bien moi truong tren Vercel:
//   USERS          (bat buoc) danh sach tai khoan, moi dong 1 nguoi:
//                    an:MatKhauCuaAn
//                    binh:MatKhauCuaBinh
//                  (co the ngan cach bang dau ; thay cho xuong dong)
//   SESSION_SECRET (tuy chon) chuoi bi mat dai >= 32 ky tu de ky phien.
//                  Bo trong: tu sinh tu USERS (them/bot nguoi se dang xuat tat ca).
//   SESSION_DAYS   (tuy chon) so ngay giu dang nhap, mac dinh 7.
// ============================================================
export const COOKIE = 'st2b_session';
const enc = new TextEncoder();

function b64uFromBytes(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64uFromStr(str) { return b64uFromBytes(enc.encode(str)); }
function strFromB64u(s) { return new TextDecoder().decode(bytesFromB64u(s)); }

async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('');
}

/* danh sach tai khoan tu USERS */
export function parseUsers(raw) {
  const map = new Map();
  String(raw || '').split(/[\r\n;]+/).forEach(line => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    const i = l.indexOf(':');
    if (i <= 0) return;
    const name = l.slice(0, i).trim();
    const pw = l.slice(i + 1).trim();   // bo dau cach thua quanh mat khau
    if (name && pw) map.set(name.toLowerCase(), { name, pw });
  });
  return map;
}
export function usersConfigured() { return parseUsers(process.env.USERS).size > 0; }

async function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return 'derived:' + await sha256hex('st2b-v1|' + (process.env.USERS || ''));
}
async function hmacKey() {
  return crypto.subtle.importKey('raw', enc.encode(await secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/* so sanh mat khau thoi gian khong doi (so sanh bam) */
export async function checkPassword(username, password) {
  const u = parseUsers(process.env.USERS).get(String(username || '').trim().toLowerCase());
  const a = await sha256hex('pw|' + String(password || ''));
  const b = await sha256hex('pw|' + (u ? u.pw : '\u0000khong-ton-tai'));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return (u && diff === 0) ? u.name : null;
}

/* tao / kiem tra phien: payload{u, exp, v}; v = dau van tay mat khau -> doi mat khau la mat phien cu */
export async function makeToken(name) {
  const u = parseUsers(process.env.USERS).get(name.toLowerCase());
  const days = Math.max(1, Math.min(90, parseInt(process.env.SESSION_DAYS || '7', 10) || 7));
  const payload = { u: name, exp: Date.now() + days * 86400000, v: (await sha256hex('fp|' + u.pw)).slice(0, 16) };
  const p = b64uFromStr(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(p));
  return { token: p + '.' + b64uFromBytes(sig), maxAge: days * 86400 };
}
export async function verifyToken(token) {
  try {
    if (!token || token.indexOf('.') < 0) return null;
    const [p, s] = token.split('.');
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), bytesFromB64u(s), enc.encode(p));
    if (!ok) return null;
    const payload = JSON.parse(strFromB64u(p));
    if (!payload.exp || payload.exp < Date.now()) return null;
    const u = parseUsers(process.env.USERS).get(String(payload.u || '').toLowerCase());
    if (!u) return null;                                   // da bi xoa khoi danh sach -> mat quyen ngay
    if ((await sha256hex('fp|' + u.pw)).slice(0, 16) !== payload.v) return null;  // da doi mat khau
    return u.name;
  } catch (e) { return null; }
}
export function readCookie(header, name) {
  const m = String(header || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
/* dung trong ham /api kieu Node (req.headers.cookie) */
export async function userFromNodeReq(req) {
  return verifyToken(readCookie(req.headers && req.headers.cookie, COOKIE));
}
