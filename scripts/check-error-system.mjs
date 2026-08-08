import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp'],['.svg','image/svg+xml'],
]);
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control':'no-store'});
    fs.createReadStream(target).pipe(res);
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const browser = await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const page = await context.newPage();
const reports = [];

await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:`window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa_user',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`}));
const gasReply = JSON.stringify({success:true,isBanned:false,wowStars:20,wsStars:0,swLevel:0,lastGames:[]});
for (const pattern of ['https://script.google.com/**','https://script.googleusercontent.com/**']) await page.route(pattern,(route)=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:gasReply}));
await page.route('https://alias-spy-games-observability.vitaledanilov.workers.dev/**', async (route) => {
  const request = route.request();
  if (request.method() === 'POST') {
    try { reports.push(JSON.parse(request.postData() || '{}')); } catch {}
  }
  await route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify({ok:true,recentErrors:[]})});
});

await page.goto(baseURL,{waitUntil:'commit',timeout:20_000});
await page.waitForSelector('#main-loader',{timeout:5_000});
await page.waitForSelector('#menu-container:not(.hidden)',{timeout:10_000});
await page.waitForFunction(() => !document.documentElement.classList.contains('app-menu-preparing'),null,{timeout:10_000});
await page.evaluate(() => window.showGame('alias'));
await page.waitForFunction(() => document.body.dataset.currentGame === 'alias' && !document.querySelector('.app-game-loading'),null,{timeout:12_000});

await page.evaluate(() => setTimeout(() => { throw new Error('QA_FATAL_TECHNICAL_DETAIL'); }, 0));
await page.waitForSelector('#app-fatal-error',{timeout:5_000});
const fatalText = await page.locator('#app-fatal-error').innerText();
if (!/Не удалось продолжить игру/.test(fatalText)) throw new Error('Friendly fatal message is missing');
if (/QA_FATAL_TECHNICAL_DETAIL/.test(fatalText)) throw new Error('Technical error leaked into user-visible text');
await page.waitForFunction(() => window.__qaReportsReady || true);
await page.waitForTimeout(200);
if (!reports.some((item) => item.event === 'client_error' && String(item.message || '').includes('QA_FATAL_TECHNICAL_DETAIL'))) throw new Error('Technical error was not reported');

await page.locator('.app-fatal-error__menu').click();
await page.waitForSelector('#menu-container:not(.hidden)',{timeout:5_000});
await page.waitForFunction(() => !document.documentElement.classList.contains('app-menu-preparing'),null,{timeout:5_000});
if (await page.locator('#app-fatal-error').count()) throw new Error('Fatal overlay did not close');

await page.evaluate(() => window.showGame('alias'));
await page.waitForFunction(() => document.body.dataset.currentGame === 'alias' && !document.querySelector('.app-game-loading'),null,{timeout:12_000});
await page.evaluate(() => { document.getElementById('game-container').innerHTML = '<div style="color:red">Ошибка: Библиотека Three.js не подключена!</div>'; });
await page.waitForSelector('.app-friendly-error',{timeout:5_000});
const friendlyText = await page.locator('.app-friendly-error').innerText();
if (!/Не удалось открыть игру/.test(friendlyText)) throw new Error('Handled technical error was not normalized');
if (/Three\.js/.test(friendlyText)) throw new Error('Dependency name leaked into friendly error');

console.log('OK: fatal and handled technical errors are user-friendly and reported.');
await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
