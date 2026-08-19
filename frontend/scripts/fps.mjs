import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:5174";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sample(page, ms) {
  return page.evaluate(async (duration) => {
    const deltas = [];
    let last = performance.now();
    let running = true;
    const tick = (t) => {
      deltas.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, duration));
    running = false;
    deltas.shift();
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const max = Math.max(...deltas);
    const janky = deltas.filter((d) => d > 20).length;
    return { frames: deltas.length, avg: +avg.toFixed(1), max: +max.toFixed(1), janky };
  }, ms);
}

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
await sleep(1800);

// Medir cambio de neurona
const switchP = sample(page, 900);
await page.keyboard.press("ArrowRight");
const switchStats = await switchP;

await sleep(400);

// Medir abrir agentes
const openP = sample(page, 900);
await page.evaluate(() => {
  [...document.querySelectorAll(".brain-carousel .btn")]
    .find((b) => /abrir/i.test(b.textContent || ""))
    ?.click();
});
const openStats = await openP;

console.log(JSON.stringify({ switch: switchStats, open: openStats }));
await browser.close();
