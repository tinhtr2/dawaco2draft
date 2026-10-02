# Hướng dẫn bật đăng nhập cho app trên Vercel

Sau khi làm xong: ai mở link app cũng phải đăng nhập bằng tài khoản bạn cấp. Người dùng **không cần API key** — AI chạy bằng một key OpenRouter chung đặt trên máy chủ, không ai nhìn thấy.

## Bước 1. Tạo key OpenRouter và đặt hạn mức chi (5 phút)

1. Vào **openrouter.ai** → đăng nhập → **Credits** → nạp tiền (ví dụ 10 USD).
2. Vào **Keys** → **Create Key** → đặt tên (vd `app-soan-thao`) → ô **Credit limit** nhập số tiền tối đa cho phép tiêu (vd 10) → tạo → copy chuỗi `sk-or-...`.

> Hạn mức chi là "van an toàn": dù ai dùng nhiều đến đâu, key cũng tự dừng khi chạm mức này.

## Bước 2. Khai báo trên Vercel (5 phút)

Vào **vercel.com** → chọn project → **Settings → Environment Variables**, thêm từng biến:

| Tên biến | Giá trị | Bắt buộc |
|---|---|---|
| `OPENROUTER_API_KEY` | chuỗi `sk-or-...` vừa copy | Có |
| `USERS` | danh sách tài khoản, **mỗi dòng một người**, dạng `tên:mật khẩu` | Có |
| `SESSION_SECRET` | một chuỗi ngẫu nhiên dài ≥ 32 ký tự (gõ bừa cũng được) | Nên có |
| `SESSION_DAYS` | số ngày giữ đăng nhập, mặc định `7` | Không |
| `AI_MODEL` | tên model OpenRouter; bỏ trống = tự chọn Gemini Flash mới nhất | Không |

Ví dụ giá trị `USERS`:

```
an:MatKhau@An2026
binh:Binh#Dawaco9
chi:ChiPhongKT!7
```

Quy tắc: tên không phân biệt hoa thường; mật khẩu **không chứa dấu chấm phẩy `;`**; dấu cách thừa ở hai đầu tự bỏ qua.

> Nếu không đặt `SESSION_SECRET`, app vẫn chạy, nhưng mỗi lần bạn thêm hoặc bớt người trong `USERS`, mọi người sẽ bị đăng xuất.

## Bước 3. Tải bộ file lên kho GitHub (5 phút)

Giải nén `goi_vercel.zip`, mở kho GitHub đang nối với Vercel → **Add file → Upload files** → kéo **toàn bộ** các file và 2 thư mục `api`, `lib` vào (Chrome cho kéo cả thư mục) → **Commit changes**.

Cấu trúc trong kho sau khi tải lên phải đúng như sau:

```
index.html          ← app (thay file cũ)
login.html          ← trang đăng nhập
middleware.js       ← cổng chặn
package.json
lib/auth.js
api/ai.js           ← thay file cũ
api/login.js
api/logout.js
api/me.js
library.json        ← thư viện mẫu (giữ nguyên nếu đã có)
```

Vercel tự triển khai lại sau khoảng 1 phút.

## Bước 4. Kiểm tra

1. Mở link app bằng **cửa sổ ẩn danh** → phải thấy trang đăng nhập.
2. Đăng nhập bằng một tài khoản trong `USERS` → vào app, góc phải có tên bạn và nút **Đăng xuất**; mục Cài đặt AI hiện *"AI dùng chung của cơ quan — bạn không cần nhập API key"*.
3. Thử rút trích một văn bản.

## Quản lý người dùng hằng ngày

| Việc | Cách làm |
|---|---|
| Thêm người | Sửa `USERS`, thêm một dòng → **Deployments → Redeploy** |
| Đổi mật khẩu | Sửa dòng của người đó → Redeploy. Phiên cũ của họ tự mất hiệu lực |
| Thu hồi quyền | Xóa dòng của người đó → Redeploy. Họ bị chặn ngay lần bấm tiếp theo |
| Đăng xuất tất cả | Đổi `SESSION_SECRET` sang chuỗi khác → Redeploy |

> Vercel chỉ áp dụng biến môi trường mới sau khi **Redeploy** — sửa xong mà quên bước này thì chưa có tác dụng.

## Nên làm thêm: chuyển kho GitHub sang Riêng tư

Trước đây kho phải để Công khai để đồng nghiệp tải thư viện mẫu. Giờ app đọc thư viện ngay trên Vercel (sau cổng đăng nhập), nên có thể chuyển kho sang **Private** để mẫu của cơ quan không còn ai trên mạng xem được: GitHub → kho → **Settings → General → Danger Zone → Change visibility → Private**. Bạn (quản trị) vẫn đẩy thư viện bằng token như cũ; mỗi lần đẩy, Vercel tự triển khai lại trong khoảng 1 phút rồi mọi người mới thấy bản mới.

## Theo dõi chi phí

- **openrouter.ai → Activity**: tiền đã tiêu theo ngày, theo model.
- **Vercel → project → Logs**: mỗi lần gọi AI ghi một dòng `[AI] nguoi_dung=an so_file=2 ...` — biết ai dùng nhiều.

## Lưu ý an toàn

- Mật khẩu nằm trong biến môi trường Vercel — chỉ ai có quyền vào project Vercel mới thấy. Đừng dùng lại mật khẩu email hay ngân hàng.
- Đăng nhập sai bị làm chậm cố ý để chống dò mật khẩu, nhưng không khóa tài khoản — hãy đặt mật khẩu đủ dài (≥ 10 ký tự, có chữ và số).
- Gói Vercel miễn phí (Hobby) theo điều khoản chỉ dành cho mục đích cá nhân, phi thương mại. Nếu đây là công cụ dùng chính thức trong công ty, nên cân nhắc gói Pro.
- Mở file `index.html` trực tiếp trên máy (không qua Vercel) thì app chạy như cũ — nhập key riêng trong Cài đặt AI.
