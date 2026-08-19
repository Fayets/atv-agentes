import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:5174";
const OUT = process.env.OUT_DIR || "../.tmp-reel";
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
await sleep(1600);
await page.keyboard.press("Escape");
await sleep(1600);
await page.screenshot({ path: `${OUT}/shot_map.png` });
await browser.close();
console.log("done");
