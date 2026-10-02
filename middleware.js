// ============================================================
// middleware.js — CONG CHAN phia may chu Vercel
// Moi yeu cau (trang app, thu vien mau, goi AI) deu phai co phien
// dang nhap hop le. Chua dang nhap -> chuyen ve /login.html.
// ============================================================
import { next } from '@vercel/functions';
import { COOKIE, readCookie, verifyToken, usersConfigured } from './lib/auth.js';

export const config = {
  // chay cho moi duong dan, TRU trang dang nhap va 2 ham dang nhap/dang xuat
  matcher: ['/((?!login\\.html|api/login|api/logout|favicon\\.ico).*)'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');

  // Chua cau hinh USERS -> KHOA HAN (an toan: khong vo tinh mo cua)
  if (!usersConfigured()) {
    const msg = 'App đang khóa: quản trị chưa khai báo biến môi trường USERS trên Vercel (xem HUONG_DAN_DANG_NHAP).';
    return isApi
      ? Response.json({ error: msg }, { status: 503 })
      : new Response('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto"><h2>Chưa cấu hình đăng nhập</h2><p>' + msg + '</p></body>',
          { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const user = await verifyToken(readCookie(request.headers.get('cookie'), COOKIE));
  if (user) return next({ headers: { 'x-st2b-user': encodeURIComponent(user) } });

  if (isApi) return Response.json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn — hãy đăng nhập lại.' }, { status: 401 });
  const to = new URL('/login.html', request.url);
  if (url.pathname !== '/' && url.pathname !== '/index.html') to.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(to, 302);
}
