// Renders the social share card and app icons with headless Chrome, using the site's own fonts.
// Run from the repo root: node tools/render-images.js   (needs tests/node_modules installed)
const path = require('path');
const { chromium } = require(path.join(__dirname, '../tests/node_modules/@playwright/test'));
const root = path.join(__dirname, '..');
const font = (f) => `url(data:font/woff2;base64,${require('fs').readFileSync(path.join(root, 'fonts', f)).toString('base64')})`;
const base = `
  @font-face { font-family: Bungee; src: ${font('bungee-latin-4e46cf.woff2')}; }
  @font-face { font-family: Archivo; src: ${font('archivo-latin-ad60be.woff2')}; font-weight: 100 900; font-stretch: 62% 125%; }
  * { margin: 0; box-sizing: border-box; }
  html, body { overflow: hidden; } body { background: #f4f2ed; color: #111; font-family: Archivo, sans-serif; }`;

const card = `<style>${base}
  .c { width: 1200px; height: 630px; padding: 64px 72px; display: flex; flex-direction: column; justify-content: space-between; border: 14px solid #111; }
  h1 { font-family: Bungee; font-size: 150px; line-height: .86; letter-spacing: -2px; }
  h1 span { color: #e63323; }
  .sub { font-size: 40px; font-weight: 600; margin-top: 18px; }
  .route { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; }
  .pill { border: 3px solid #111; padding: 10px 18px; background: #fff; }
  .pill.end { background: #e63323; color: #fff; border-color: #e63323; }
  .arrow { color: #e63323; font-weight: 900; }
  .row { display: flex; justify-content: space-between; align-items: flex-end; }
  .url { font-size: 30px; font-weight: 800; }
</style>
<div class="c">
  <div><h1>Wiki<br><span>Racer</span></h1><p class="sub">Race friends through Wikipedia, one link at a time.</p></div>
  <div class="row">
    <div class="route"><span class="pill">Pizza</span><span class="arrow">→</span><span class="pill">Italy</span><span class="arrow">→</span><span class="pill end">Roman Empire</span></div>
    <span class="url">wikiracer.live</span>
  </div>
</div>`;

const icon = (size, pad) => `<style>${base}
  body { background: #e63323; }
  .i { width: ${size}px; height: ${size}px; display: grid; place-items: center; padding: ${pad}px; }
  b { font-family: Bungee; color: #fff; font-size: ${Math.round(size * 0.46)}px; letter-spacing: -1px; line-height: 1; }
</style><div class="i"><b>WR</b></div>`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const shot = async (html, w, h, out) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent('<!doctype html><meta charset=utf-8>' + html);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('body > div').screenshot({ path: path.join(root, out), animations: 'disabled' });
    await page.close();
    console.log('wrote', out);
  };
  await shot(card, 1200, 630, 'og.png');
  for (const s of [32, 180, 192, 512]) await shot(icon(s, 0), s, s, `icons/icon-${s}.png`);
  await shot(icon(512, 60), 512, 512, 'icons/maskable-512.png');
  await browser.close();
})();
