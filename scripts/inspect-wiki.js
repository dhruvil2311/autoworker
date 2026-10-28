import puppeteer from 'puppeteer';

async function test() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://en.wikipedia.org/w/index.php?title=Special:UserLogin', { waitUntil: 'domcontentloaded' });
  
  const user = await page.$('#wpName1, input[name="wpName"]');
  const pass = await page.$('#wpPassword1, input[name="wpPassword"]');
  const submit = await page.$('#wpLoginAttempt, button[type="submit"]');
  
  console.log('Wikipedia Login Elements:');
  console.log('Username field found:', Boolean(user));
  console.log('Password field found:', Boolean(pass));
  console.log('Submit button found:', Boolean(submit));
  
  await browser.close();
}

test().catch(console.error);
