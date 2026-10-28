import { chromium } from 'playwright';

async function testUrls() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('--- Testing URL 1: Adobe Auth URL ---');
  const adobeUrl = "https://auth.services.adobe.com/en_US/index.html?callback=https%3A%2F%2Fims-na1.adobelogin.com%2Fims%2Fadobeid%2Fmagento-passport%2FAdobeID%2Fcode%3Fredirect_uri%3Dhttps%253A%252F%252Fdemo-magento-2.auroracreation.com%252Fadmin%252F";
  try {
    const resp1 = await page.goto(adobeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('Adobe URL status:', resp1?.status());
    console.log('Adobe final URL:', page.url());
    console.log('Adobe page title:', await page.title());
    await page.waitForTimeout(3000);
    console.log('After 3s, URL:', page.url());
    console.log('Title:', await page.title());
    const bodyText1 = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Adobe body sample:', bodyText1);
  } catch (err: any) {
    console.error('Error loading Adobe URL:', err.message);
  }

  console.log('\n--- Testing URL 2: Magento Admin Panel URL ---');
  const magentoUrl = "https://demo-magento-2.auroracreation.com/admin_panel/";
  try {
    const resp2 = await page.goto(magentoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('Magento URL status:', resp2?.status());
    console.log('Magento final URL:', page.url());
    console.log('Magento page title:', await page.title());
    await page.waitForTimeout(3000);
    console.log('After 3s, URL:', page.url());
    console.log('Title:', await page.title());
    const bodyText2 = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Magento body sample:', bodyText2);
    
    // Check form fields
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        placeholder: i.placeholder,
        value: i.value
      }));
    });
    console.log('Magento inputs on page:', inputs);
  } catch (err: any) {
    console.error('Error loading Magento URL:', err.message);
  }

  await browser.close();
}

testUrls().catch(console.error);
