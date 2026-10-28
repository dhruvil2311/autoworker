import { chromium } from 'playwright';

async function testMagentoUrl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const urls = [
    'https://demo-magento-2.auroracreation.com/admin_panel/',
    'https://demo-magento-2.auroracreation.com/admin/',
    'https://demo-magento-2.auroracreation.com/',
  ];

  for (const u of urls) {
    console.log(`\nTesting: ${u}`);
    try {
      const resp = await page.goto(u, { waitUntil: 'load', timeout: 25000 });
      console.log(`Status: ${resp?.status()}`);
      console.log(`Final URL: ${page.url()}`);
      console.log(`Title: ${await page.title()}`);
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
      console.log(`Body text: ${bodyText}`);
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          placeholder: i.placeholder
        }));
      });
      console.log('Inputs:', inputs);
      break; // Found working URL
    } catch (err: any) {
      console.log(`Failed ${u}: ${err.message}`);
    }
  }

  await browser.close();
}

testMagentoUrl().catch(console.error);
