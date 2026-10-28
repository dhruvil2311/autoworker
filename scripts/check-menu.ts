import { chromium } from 'playwright';

async function checkMenu() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://demo-magento-2.auroracreation.com/admin_panel/');
  await page.fill('#username', 'demo_admin');
  await page.fill('#login', 'demo_admin123');
  
  const signinBtn = await page.$('button.action-login, button.action-primary');
  await Promise.all([
    page.waitForURL('**/dashboard/**', { timeout: 25000 }),
    signinBtn?.click()
  ]);
  console.log('Logged into dashboard!');

  const salesHTML = await page.evaluate(() => {
    const el = document.querySelector('#menu-magento-sales-sales');
    return el ? el.outerHTML : 'NOT_FOUND';
  });
  console.log('Sales element HTML:');
  console.log(salesHTML.slice(0, 500));

  await browser.close();
}

checkMenu().catch(console.error);
