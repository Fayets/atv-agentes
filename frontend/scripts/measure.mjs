import puppeteer from "puppeteer-core";

const BASE = "http://localhost:5174";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#email", "demo@atvsoft.com");
await page.type("#password", "demo1234");
await page.click("#login-form button[type=submit]");
await page.waitForSelector(".brain-svg", { timeout: 15000 });
await sleep(1500);

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      transform: cs.transform,
      display: cs.display,
      alignItems: cs.alignItems,
      placeItems: cs.placeItems,
    };
  };
  return {
    shell: pick(".brain-shell"),
    wrap: pick(".brain-viewport-wrap"),
    viewport: pick(".brain-viewport"),
    svg: pick(".brain-svg"),
    win: { w: innerWidth, h: innerHeight, scrollY: scrollY, bodyH: document.body.scrollHeight },
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
