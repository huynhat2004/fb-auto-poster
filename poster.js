const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ================= CẤU HÌNH =================
const QUEUE_FILE = path.join(__dirname, 'queue/queue.json');
const QUEUE_DIR = path.join(__dirname, 'queue');
const HISTORY_DIR = path.join(__dirname, 'history');
const LOG_FILE = path.join(__dirname, 'history.log');
const STATE_FILE = path.join(__dirname, 'fb-state.json');

const DEFAULT_TARGET_TYPE = 'profile';
const DELAY_BETWEEN_POSTS = { min: 60000, max: 80000 };

// URL Profile cá nhân - dùng để chuyển về khi đang ở Fanpage
const PERSONAL_PROFILE_URL = 'https://www.facebook.com/profile.php?id=100037011466067';

// Ghi nhớ tên Fanpage vừa đăng - dùng để loại trừ khi chuyển về Profile
let lastFanpageName = null;
// ============================================

function log(message) {
  const timestamp = new Date().toLocaleString('vi-VN');
  const msg = `[${timestamp}] ${message}`;
  console.log(msg);
  try { fs.appendFileSync(LOG_FILE, msg + '\n'); } catch (e) {}
}

async function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  log(`⏳ Nghỉ ${Math.floor(delay/1000)}s...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function handleSwitchProfile(page, targetName) {
  log('🔄 Kiểm tra yêu cầu chuyển Profile...');
  
  // 1. Ưu tiên 1: Tìm nút Switch trực tiếp trên trang (Banner của Facebook)
  const bannerSwitch = page.locator('div[aria-label="Switch Now"], div[aria-label="Chuyển ngay"], div[role="button"]:has-text("Switch"), div[role="button"]:has-text("Chuyển"), a[role="button"]:has-text("Switch Now")').first();
  
  if (await bannerSwitch.isVisible()) {
      log('🔘 Phát hiện banner Chuyển trực tiếp trên trang. Đang thực hiện chuyển đổi...');
      for (let j = 0; j < 3; j++) {
          const isVisible = await bannerSwitch.isVisible();
          if (!isVisible) break;
          
          log(`🔄 Click nút Switch Now (Lần ${j+1})...`);
          await bannerSwitch.click({ force: true }).catch(() => {});
          await page.waitForTimeout(5000);
          
          // Kiểm tra xem có dialog xác nhận không
          const confirmBtn = page.locator('div[role="dialog"] div[role="button"]:has-text("Switch"), div[role="dialog"] div[role="button"]:has-text("Chuyển")').first();
          if (await confirmBtn.isVisible()) {
              log('🔘 Bấm xác nhận trong Dialog chuyển đổi...');
              await confirmBtn.click({ force: true });
              await page.waitForTimeout(10000);
          }
      }
      log('✅ Đã thực hiện các bước chuyển đổi từ banner.');
      return true;
  }

  // 2. Ưu tiên 2: Quy trình qua Menu Tài khoản
  for (let i = 0; i < 3; i++) {
    log(`🔍 Thử tìm nút Switch qua Menu tài khoản (Lần ${i+1})...`);
    
    // Mở Menu tài khoản (Top Right)
    log(`🔍 Tìm kiếm Account Menu...`);
    const accountMenu = page.locator([
        'div[aria-label="Your profile"]',
        'div[aria-label="Trang cá nhân của bạn"]',
        'div[aria-label="Account"]',
        'div[aria-label="Tài khoản"]',
        '[role="banner"] div[role="button"] img', // Profile pic in header
        'svg[aria-label="Your profile"]',
        'svg[aria-label="Trang cá nhân của bạn"]'
    ].join(', ')).first();

    if (await accountMenu.isVisible()) {
        log('🔘 Đã tìm thấy Account Menu. Đang click...');
        await accountMenu.click();
        await page.waitForTimeout(4000);
        
        // 2a. Lấy tên tài khoản hiện tại để loại trừ
        const currentAccountName = await page.evaluate(() => {
            const menu = document.querySelector('div[role="menu"]');
            if (menu) {
                const nameEl = menu.querySelector('h1, h2, span[dir="auto"]');
                const name = nameEl ? nameEl.innerText.split('\n')[0].trim() : "";
                if (name.length > 0 && !name.toLowerCase().includes('setting') && !name.toLowerCase().includes('feedback')) return name;
            }
            const btn = document.querySelector('div[aria-label*="Your profile"], div[aria-label*="Trang cá nhân"], div[aria-label*="Account"], div[aria-label*="Tài khoản"]');
            const label = btn?.getAttribute('aria-label') || "";
            if (label.includes(',')) return label.split(',').pop().trim();
            return "";
        });
        log(`👤 Tài khoản hiện tại đang dùng: "${currentAccountName}"`);

        // Đọc tên Profile từ file nếu có (Ưu tiên Viet Nguyen)
        if (!targetName) {
            const NAME_FILE = path.join(__dirname, 'profile_name.txt');
            if (fs.existsSync(NAME_FILE)) {
                targetName = fs.readFileSync(NAME_FILE, 'utf8').trim();
                log(`📖 Sử dụng tên Profile đã lưu: "${targetName}"`);
            }
        }

        // 2b. Thử tìm nút Chuyển đổi trực tiếp trong Menu chính
        const directSwitch = page.locator('div[role="button"]:has-text("Switch to"), div[role="button"]:has-text("Chuyển sang")').first();
        if (await directSwitch.isVisible()) {
            log('🔘 Phát hiện nút Chuyển đổi trực tiếp trong Menu. Đang bấm...');
            await directSwitch.click();
            await page.waitForTimeout(15000);
            return true;
        }

        // 2c. Vào "See all profiles"
        const seeAllBtn = page.locator([
            'div[role="button"]:has-text("See all profiles")',
            'div[role="button"]:has-text("Xem tất cả trang cá nhân")'
        ].join(', ')).first();
        
        if (await seeAllBtn.isVisible()) {
            log('🔘 Đã tìm thấy "See all profiles". Đang click...');
            await seeAllBtn.click();
            await page.waitForTimeout(5000);
            
            let profileToSwitch;
            // Nếu có tên cụ thể (Viet Nguyen), tìm chính xác hoặc tương đối
            if (targetName) {
                log(`🔍 Đang tìm Profile đích: ${targetName}`);
                profileToSwitch = page.locator(`div[aria-label*="${targetName}"], [role="radio"] div:has-text("${targetName}"), [role="button"] div:has-text("${targetName}"), [role="menuitem"] div:has-text("${targetName}")`).first();
            }

            // Nếu không tìm được bằng tên, dùng logic loại trừ
            if (!profileToSwitch || !(await profileToSwitch.isVisible())) {
                log(`🔍 Không thấy bằng tên, quét danh sách để loại trừ: "${currentAccountName}"`);
                const targetBox = await page.evaluate((excludeName) => {
                    const menu = document.querySelector('div[role="menu"], div[role="dialog"]');
                    if (!menu) return null;
                    const items = Array.from(menu.querySelectorAll('div[role="radio"], div[role="menuitemradio"], div[role="button"], div[role="menuitem"]'));
                    
                    const target = items.find(el => {
                        const text = el.innerText?.trim() || "";
                        const hasImage = el.querySelector('img') || el.querySelector('image');
                        const isNotCurrent = text.length > 0 && text !== excludeName && !text.includes(excludeName);
                        const isNotActionBtn = !text.includes('See all') && !text.includes('Xem tất cả') && !text.includes('Settings');
                        return hasImage && isNotCurrent && isNotActionBtn;
                    });
                    
                    if (target) {
                        const rect = target.getBoundingClientRect();
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, name: target.innerText };
                    }
                    return null;
                }, currentAccountName);

                if (targetBox && targetBox.y > 60) {
                    log(`🎯 Đã tìm thấy mục tiêu: "${targetBox.name.split('\n')[0]}". Click tọa độ: ${targetBox.x}, ${targetBox.y}`);
                    await page.mouse.click(targetBox.x, targetBox.y);
                    await page.waitForTimeout(1000);
                    await page.mouse.click(targetBox.x, targetBox.y);
                    await page.waitForTimeout(3000);
                    
                    const confirmBtn = page.locator('div[role="dialog"] div[role="button"]:has-text("Switch"), div[role="dialog"] div[role="button"]:has-text("Chuyển")').first();
                    if (await confirmBtn.isVisible()) {
                        log('🔘 Phát hiện Dialog xác nhận. Đang bấm Switch...');
                        await confirmBtn.click({ force: true });
                        await page.waitForTimeout(15000);
                    } else {
                        await page.waitForTimeout(12000);
                    }
                    
                    const isPage = await page.evaluate(() => document.body.innerText.includes('Professional dashboard') || document.body.innerText.includes('Bảng điều khiển chuyên nghiệp'));
                    if (!isPage) { log('✅ Xác nhận: Đã về Profile.'); return true; }
                }
            }

            if (profileToSwitch && await profileToSwitch.isVisible()) {
                log('🔄 Đang click chuyển profile...');
                await profileToSwitch.click({ force: true });
                await page.waitForTimeout(15000);
                return true;
            }
        }
        await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(2000);
  }

  // Nếu là profile (targetName null) mà vẫn chưa chuyển được sau 3 lần
  if (!targetName) {
      throw new Error("❌ KHÔNG THỂ QUAY VỀ PROFILE CÁ NHÂN. Dừng để tránh đăng nhầm.");
  }

  log('⚠️ Không tìm thấy nút chuyển Profile nào.');
  return false;
}

async function runPoster() {
  if (!fs.existsSync(STATE_FILE)) { log('❌ LỖI: Thiếu fb-state.json'); return; }
  if (!fs.existsSync(QUEUE_FILE)) { log('📭 Hàng đợi trống.'); return; }

  let queue = [];
  try {
    const content = fs.readFileSync(QUEUE_FILE, 'utf8');
    queue = content ? JSON.parse(content) : [];
  } catch (e) { log('❌ LỖI: Đọc queue.json thất bại'); return; }

  if (queue.length === 0) { log('📭 Hàng đợi trống.'); return; }

  log(`🚀 Bắt đầu POST bài (Tổng: ${queue.length})...`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();

  try {
    while (queue.length > 0) {
      const { id, text, images, image, targetType = 'profile', targetId, targetName: manualTargetName } = queue[0];
      const mediaFiles = images || (image ? [image] : []);
      
      log(`\n📝 Đang đăng bài: ${id || 'N/A'}`);
      
      let url = 'https://www.facebook.com';
      if (targetType === 'page' && targetId) url = `https://www.facebook.com/${targetId}`;
      else if (targetType === 'group' && targetId) url = `https://www.facebook.com/groups/${targetId}`;

      log(`🔗 Truy cập: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);

      let switchPerformed = false;
      if (targetType === 'page' && targetId) {
          log('🔄 Đang kiểm tra chuyển sang Profile Fanpage...');
          let targetName = manualTargetName;
          
          if (!targetName) {
              targetName = await page.evaluate(() => {
                  const h1s = Array.from(document.querySelectorAll('h1'));
                  const exclusions = ['Facebook', 'Notifications', 'Thông báo', 'Manage Page', 'Quản lý Trang', 'Professional dashboard', 'Bảng điều khiển chuyên nghiệp'];
                  let name = '';
                  for (const h1 of h1s) {
                      const text = h1.innerText?.trim();
                      if (text && !exclusions.includes(text)) { name = text; break; }
                  }
                  if (!name) name = document.title.replace(/^\(\d+\)\s*/, '').split(' | ')[0];
                  return name;
              });
          }
          
          lastFanpageName = targetName; // Ghi nhớ tên Fanpage vừa đăng
          log(`📌 Tên Fanpage đích: ${targetName}`);
          switchPerformed = await handleSwitchProfile(page, targetName);

      } else if (targetType === 'profile') {
          log('🔄 Đang kiểm tra tư cách người dùng hiện tại...');
          
          const isOnFanpage = await page.evaluate(() => {
              const bodyText = document.body.innerText;
              return bodyText.includes('Professional dashboard') ||
                     bodyText.includes('Bảng điều khiển chuyên nghiệp') ||
                     bodyText.includes('Meta Business Suite');
          });
          
          if (isOnFanpage) {
              log(`🔄 Đang là Fanpage ("${lastFanpageName}"). Chuyển về Profile cá nhân...`);
              
              // Chiến lược: Dùng Account Menu → See all profiles
              // Loại trừ Fanpage theo tên đã biết
              let switched = false;
              
              for (let attempt = 1; attempt <= 3 && !switched; attempt++) {
                  log(`🔍 Thử chuyển về Profile (Lần ${attempt}/3)...`);
                  const accountMenu = page.locator([
                      'div[aria-label="Your profile"]', 'div[aria-label="Trang cá nhân của bạn"]',
                      'div[aria-label="Account"]', 'div[aria-label="Tài khoản"]',
                      '[role="banner"] div[role="button"] img'
                  ].join(', ')).first();
                  
                  if (!await accountMenu.isVisible()) { await page.waitForTimeout(2000); continue; }
                  
                  await accountMenu.click();
                  await page.waitForTimeout(3000);
                  
                  const seeAllBtn = page.locator([
                      'div[role="button"]:has-text("See all profiles")',
                      'div[role="button"]:has-text("Xem tất cả trang cá nhân")'
                  ].join(', ')).first();
                  
                  if (!await seeAllBtn.isVisible()) {
                      await page.keyboard.press('Escape');
                      await page.waitForTimeout(2000);
                      continue;
                  }
                  
                  await seeAllBtn.click();
                  await page.waitForTimeout(4000);
                  
                  // Dùng DOM click trực tiếp - không phụ thuộc tọa độ
                  const clicked = await page.evaluate((fanpageName) => {
                      const menu = document.querySelector('div[role="menu"], div[role="dialog"]');
                      if (!menu) return { ok: false, reason: 'no menu' };
                      
                      // Tìm nút "Switch to [Tên]" mà KHÔNG phải Fanpage
                      const switchBtns = Array.from(menu.querySelectorAll('div[role="button"][aria-label]'));
                      const target = switchBtns.find(el => {
                          const label = el.getAttribute('aria-label') || '';
                          return (label.startsWith('Switch to') || label.startsWith('Chuyển sang')) 
                                 && !label.includes(fanpageName);
                      });
                      
                      if (target) {
                          target.click();
                          return { ok: true, name: target.getAttribute('aria-label') };
                      }
                      
                      // Fallback: listitem có SVG image không chứa tên Fanpage
                      const items = Array.from(menu.querySelectorAll('div[role="listitem"]'));
                      const fallback = items.find(el => {
                          const text = el.innerText?.trim() || '';
                          return el.querySelector('image') && !text.includes(fanpageName) && text.length > 0;
                      });
                      if (fallback) {
                          fallback.click();
                          return { ok: true, name: fallback.innerText?.split('\n')[0] };
                      }
                      
                      return { ok: false, reason: 'not found' };
                  }, lastFanpageName || '');
                  
                  if (clicked.ok) {
                      log(`🎯 Đã click nút: "${clicked.name}". Đợi chuyển đổi...`);
                      await page.waitForTimeout(15000);
                      
                      // Xác minh trên trang CHỦ (quan trọng: không phải trang profile)
                      await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
                      await page.waitForTimeout(4000);
                      
                      const stillFanpage = await page.evaluate(() => {
                          return document.body.innerText.includes('Professional dashboard') ||
                                 document.body.innerText.includes('Bảng điều khiển chuyên nghiệp');
                      });
                      
                      if (!stillFanpage) {
                          log('✅ Xác nhận trên trang chủ: Đã về Profile cá nhân!');
                          switched = true;
                          switchPerformed = true;
                      } else {
                          log(`⚠️ Lần ${attempt}: Vẫn còn là Fanpage sau khi click. Thử lại...`);
                      }
                  } else {
                      log(`⚠️ Lần ${attempt}: Không tìm thấy mục trong danh sách để click.`);
                      await page.keyboard.press('Escape');
                      await page.waitForTimeout(2000);
                  }
              }
              
              if (!switched) {
                  throw new Error(`❌ Không thể chuyển về Profile cá nhân sau 3 lần thử. Dừng để tránh đăng nhầm lên Fanpage.`);
              }
          } else {
              log('✅ Đang ở tư cách Profile cá nhân.');
          }
      }

      if (switchPerformed) {
          log('🔄 Chuyển Profile hoàn tất. Truy cập lại URL để làm mới giao diện...');
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForTimeout(5000);
      }

      // 1. Mở ô soạn thảo
      log('🔍 Đang tìm ô soạn thảo...');
      // Cuộn xuống để lộ ô composer
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(2000);

      const composerSelectors = [
          'div[role="main"] [role="button"]:has-text("Photo/Video")',
          'div[role="main"] [role="button"]:has-text("Ảnh/Video")',
          'div[role="main"] [role="button"]:has-text("Bạn đang nghĩ gì")',
          'div[role="main"] [role="button"]:has-text("What\'s on your mind")',
          'div[role="main"] [role="button"]:has-text("Create post")',
          'div[role="main"] [role="button"]:has-text("Tạo bài viết")',
          'div[role="main"] [role="button"]:has-text("Write something")',
          'div[role="main"] [role="button"]:has-text("Viết nội dung nào đó")'
      ].join(', ');

      try {
          const composerBtn = page.locator(composerSelectors).first();
          if (await composerBtn.isVisible()) {
              log('🔘 Đã tìm thấy ô soạn thảo. Đang click...');
              await composerBtn.click();
          } else {
              log('⚠️ Không thấy ô soạn thảo bằng selector thông thường. Thử click tọa độ...');
              await page.mouse.click(500, 500); // Click đại vào giữa màn hình để kích hoạt nếu nó bị ẩn
          }
      } catch (e) {
          log(`⚠️ Lỗi khi click ô soạn thảo: ${e.message}`);
      }
      
      log('⏳ Đợi bảng soạn thảo tải xong...');
      const textbox = page.locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]').first();
      await textbox.waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(2000);

      // 2. Tải ảnh
      if (mediaFiles.length > 0) {
          log(`🖼️ Tải ${mediaFiles.length} ảnh...`);
          const fileInput = page.locator('input[type="file"]').last();
          await fileInput.setInputFiles(mediaFiles.map(img => path.join(QUEUE_DIR, img)));
          await page.waitForTimeout(8000);
      }

      // 3. Nhập text
      if (text) {
          log('✍️ Nhập nội dung...');
          await textbox.fill(text);
          await page.waitForTimeout(2000);
      }

      // 4. Bấm đăng
      log('🔘 Tiến hành đăng bài...');
      
      // Bấm Tiếp (nếu có)
      const nextBtn = page.locator('div[role="dialog"] div[role="button"]:has-text("Next"), div[role="dialog"] div[role="button"]:has-text("Tiếp")').first();
      if (await nextBtn.isVisible()) {
          log('🔘 Bấm nút Tiếp...');
          await nextBtn.click({ force: true });
          await page.waitForTimeout(5000);
      }

      // Dẹp WhatsApp (Nuke an toàn)
      await page.evaluate(() => {
          const popups = Array.from(document.querySelectorAll('div[role="dialog"], div[role="presentation"]'));
          popups.forEach(p => {
              if (p.innerText.includes('WhatsApp') || p.innerText.includes('contact you')) p.remove();
          });
      });
      await page.waitForTimeout(2000);

      // Bấm Đăng cuối (Thử nhiều cách)
      log('🔘 Bấm nút Đăng cuối cùng (Multi-trigger)...');
      const postBtn = page.locator('div[role="dialog"] div[role="button"]').filter({ 
          hasText: /^(Đăng|Post|Publish)$/i 
      }).last();
      
      if (await postBtn.isVisible()) {
          const box = await postBtn.boundingBox();
          if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              await page.waitForTimeout(2000);
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          }
      }
      
      // Chốt hạ bằng phím tắt
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');

      await page.waitForTimeout(15000);
      await page.screenshot({ path: `success_${Date.now()}.png` });
      log('✅ THÀNH CÔNG!');

      // Dọn dẹp
      mediaFiles.forEach(f => {
          const oldP = path.join(QUEUE_DIR, f);
          const newP = path.join(HISTORY_DIR, f);
          if (fs.existsSync(oldP)) {
              if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
              fs.renameSync(oldP, newP);
          }
      });

      queue.shift();
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

      if (queue.length > 0) await randomDelay(DELAY_BETWEEN_POSTS.min, DELAY_BETWEEN_POSTS.max);
    }
  } catch (error) {
    log(`❌ LỖI: ${error.message}`);
    await page.screenshot({ path: `error_${Date.now()}.png` });
  } finally {
    await browser.close();
    log('🏁 Kết thúc.');
  }
}

runPoster();
