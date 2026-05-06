# Facebook Auto Poster 🚀

Hệ thống tự động đăng bài lên Facebook (Profile, Page, Group) sử dụng Playwright.

## Cài đặt

1. Đảm bảo bạn đã cài đặt [Node.js](https://nodejs.org/).
2. Mở terminal tại thư mục này và cài đặt thư viện:
   ```bash
   npm install
   npx playwright install chromium
   ```

## Cách sử dụng

### Bước 1: Đăng nhập
Chạy lệnh sau để mở trình duyệt và đăng nhập Facebook thủ công:
```bash
npm run login
```
Sau khi đăng nhập thành công, nhấn **ENTER** tại terminal để lưu session.

### Bước 2: Chuẩn bị hàng đợi
- Thêm ảnh vào thư mục `queue/`.
- Cấu hình nội dung bài viết trong file `queue/queue.json`.

### Bước 3: Đăng bài
Chạy lệnh sau để đăng bài đầu tiên trong hàng đợi:
```bash
npm start
```

## Tính năng
- Tự động lấy bài từ hàng đợi (FIFO).
- Hỗ trợ đa ngôn ngữ (Tiếng Anh/Tiếng Việt).
- Tự động chuyển ảnh đã đăng sang thư mục `history/`.
- Giả lập delay ngẫu nhiên để an toàn cho tài khoản.
