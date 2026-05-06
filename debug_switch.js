const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'fb-state.json');

async function diagnose() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();
    
    // Điều hướng đến facebook khi đang là Fanpage
    await page.goto('https://www.facebook.com/61588688891696', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'debug_1_fanpage.png' });
    
    // Mở Account Menu
    const accountMenu = page.locator([
        'div[aria-label="Your profile"]', 'div[aria-label="Trang cá nhân của bạn"]',
        'div[aria-label="Account"]', 'div[aria-label="Tài khoản"]',
        '[role="banner"] div[role="button"] img'
    ].join(', ')).first();
    
    if (await accountMenu.isVisible()) {
        await accountMenu.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'debug_2_menu_open.png' });
        
        const seeAllBtn = page.locator([
            'div[role="button"]:has-text("See all profiles")',
            'div[role="button"]:has-text("Xem tất cả trang cá nhân")'
        ].join(', ')).first();
        
        if (await seeAllBtn.isVisible()) {
            await seeAllBtn.click();
            await page.waitForTimeout(4000);
            await page.screenshot({ path: 'debug_3_see_all_profiles.png' });
            
            // Dump tất cả DOM trong popup
            const domData = await page.evaluate(() => {
                const menu = document.querySelector('div[role="menu"], div[role="dialog"]');
                if (!menu) return { error: 'Không tìm thấy menu/dialog', bodySnippet: document.body.innerHTML.substring(0, 2000) };
                
                const allElements = Array.from(menu.querySelectorAll('*')).slice(0, 50).map(el => ({
                    tag: el.tagName,
                    role: el.getAttribute('role'),
                    text: el.innerText?.substring(0, 100),
                    hasImg: !!el.querySelector('img'),
                    ariaLabel: el.getAttribute('aria-label')
                }));
                
                return {
                    menuFound: true,
                    menuRole: menu.getAttribute('role'),
                    menuClass: menu.className.substring(0, 100),
                    elements: allElements
                };
            });
            
            fs.writeFileSync('debug_dom.json', JSON.stringify(domData, null, 2));
            console.log('DOM data saved to debug_dom.json');
        } else {
            console.log('Không thấy "See all profiles"');
            await page.screenshot({ path: 'debug_no_see_all.png' });
        }
    } else {
        console.log('Không thấy Account Menu');
    }
    
    console.log('Xong. Kiểm tra các file debug_*.png và debug_dom.json');
    // Không đóng browser để bạn có thể xem
    await page.waitForTimeout(30000);
    await browser.close();
}

diagnose().catch(console.error);
