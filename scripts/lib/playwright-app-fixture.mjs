// Existing gameplay/layout tests assume an authorized application session.
// Keep that fixture explicit now that the application fails closed before startup.
// The restriction/security browser test imports playwright-core directly instead.
import { chromium } from 'playwright-core';
const launch = chromium.launch.bind(chromium);

async function preparePage(page) {
  const goto = page.goto.bind(page);
  page.goto = async (...args) => {
    // Register after the gameplay test's broad backend mocks, so its default
    // response does not accidentally become a denial from the new access API.
    await page.route('**/app/access', (route) => route.fulfill({
      json: { ok: true, success: true, allowed: true, restricted: false, userId: '555555555' },
    }));
    // Isolated game tests exercise game mechanics, without a parent launcher.
    await page.route('**/standalone-app-access.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `(async()=>{window.StandaloneAppProof={testUserId:String(100000000+Math.floor(Math.random()*800000000))};document.documentElement.classList.add('standalone-access-allowed');for(const node of document.querySelectorAll('script[data-app-access-src]')){const s=document.createElement('script');s.src=node.dataset.appAccessSrc;await new Promise((resolve,reject)=>{s.onload=resolve;s.onerror=reject;node.after(s)})}})();`,
    }));
    return goto(...args);
  };
  return page;
}

chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    const newPage = context.newPage.bind(context);
    context.newPage = async (...pageOptions) => preparePage(await newPage(...pageOptions));
    return context;
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...options) => preparePage(await newPage(...options));
  return browser;
};
export { chromium };
