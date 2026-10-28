import { chromium } from 'playwright';

async function testAdobeFlow() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const adobeUrl = "https://auth.services.adobe.com/en_US/index.html?callback=https%3A%2F%2Fims-na1.adobelogin.com%2Fims%2Fadobeid%2Fmagento-passport%2FAdobeID%2Fcode%3Fredirect_uri%3Dhttps%253A%252F%252Fdemo-magento-2.auroracreation.com%252Fadmin%252F";
  await page.goto(adobeUrl, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Opened Adobe, title:', await page.title());

  const emailSelector = "#EmailPage-EmailField, input[name='EmailPage-EmailField'], input[type='email']";
  await page.waitForSelector(emailSelector, { timeout: 10000 });
  console.log('Found email selector!');

  await page.fill(emailSelector, "presentationai66@gmail.com");
  console.log('Filled email!');

  const continueBtn = "button[data-id='EmailPage-ContinueButton'], button:has-text('Continue'), .EmailPage-continue-button";
  await page.click(continueBtn);
  console.log('Clicked Continue!');

  await page.waitForTimeout(5000);
  console.log('After Continue, URL:', page.url());
  console.log('Page title:', await page.title());

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Page body sample:', bodyText);

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      id: i.id,
      name: i.name,
      type: i.type,
      placeholder: i.placeholder,
      visible: (i as HTMLElement).offsetParent !== null
    }));
  });
  console.log('Inputs after continue:', inputs);

  await browser.close();
}

testAdobeFlow().catch(console.error);
