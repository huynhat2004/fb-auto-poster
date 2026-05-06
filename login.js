const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Khởi động trình duyệt để đăng nhập...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.facebook.com');

  console.log('----------------------------------------------------');
  console.log('👉 VUI LÒNG ĐĂNG NHẬP TRÊN CỬA SỔ TRÌNH DUYỆT!');
  console.log('Hệ thống đang chờ bạn đăng nhập thành công...');
  console.log('----------------------------------------------------');

  // Chờ cho đến khi người dùng đăng nhập xong (thấy thanh tìm kiếm hoặc avatar)
  try {
    await page.waitForSelector('div[aria-label="Facebook"], div[role="search"]', { timeout: 0 });
    console.log('✅ Phát hiện đăng nhập thành công!');

    console.log('\n👉 SAU KHI ĐÃ CHỌN PROFILE ƯNG Ý (PROFILE CÁ NHÂN HOẶC PAGE), HÃY BẤM PHÍM "ENTER" TẠI ĐÂY ĐỂ LƯU SESSION:');
    
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));

    const storage = await context.storageState();
    fs.writeFileSync('fb-state.json', JSON.stringify(storage, null, 2));
    
    console.log('✅ Đã lưu trạng thái đăng nhập vào file: fb-state.json');
    console.log('Giờ bạn có thể đóng trình duyệt và bắt đầu dùng poster.js');
  } catch (err) {
    console.error('❌ Có lỗi xảy ra:', err.message);
  } finally {
    await browser.close();
    process.exit();
  }
})();
