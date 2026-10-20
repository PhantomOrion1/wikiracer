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

const face = (n) => `data:image/webp;base64,${require('fs').readFileSync(path.join(root, 'pfp', n + '.webp')).toString('base64')}`;
// Share/search preview: dark card, logo big and centred so Google's square crop still reads.
const preview = (w, h) => {
  const k = Math.min(w, h) / 630; // scale everything off the shorter side
  return `<style>${base}
  .c { width: ${w}px; height: ${h}px; background: #111; color: #f4f2ed; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${Math.round(26 * k)}px; position: relative; }
  .c::after { content: ""; position: absolute; inset: ${Math.round(18 * k)}px; border: ${Math.max(4, Math.round(6 * k))}px solid #f4f2ed; }
  h1 { font-family: Bungee; font-size: ${Math.round(150 * k)}px; line-height: .86; letter-spacing: -2px; text-align: center; }
  h1 span { color: #e63323; display: block; }
  .sub { font-size: ${Math.round(34 * k)}px; font-weight: 700; color: #d8d3c8; }
  .faces { display: flex; gap: ${Math.round(16 * k)}px; }
  .faces img { width: ${Math.round(92 * k)}px; height: ${Math.round(92 * k)}px; border: ${Math.max(2, Math.round(3 * k))}px solid #4a4a4a; display: block; }
</style>
<div class="c">
  <div class="faces"><img src="${face('ghost')}"><img src="${face('vampire')}"><img src="${face('witch')}"><img src="${face('werewolf')}"></div>
  <h1>Wiki<span>Racer</span></h1>
  <p class="sub">Race friends through Wikipedia</p>
</div>`;
};

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
  await shot(preview(1200, 630), 1200, 630, 'og.png');
  await shot(preview(1200, 1200), 1200, 1200, 'og-square.png');
  await shot(preview(1200, 900), 1200, 900, 'og-4x3.png');
  for (const s of [16, 32, 48, 96, 180, 192, 512]) await shot(icon(s, 0), s, s, `icons/icon-${s}.png`);
  await shot(icon(512, 60), 512, 512, 'icons/maskable-512.png');
  // favicon.ico at the site root (Google and old browsers look there): 16, 32 and 48px PNGs inside one ICO.
  const fs = require('fs');
  const pngs = [16, 32, 48].map((s) => fs.readFileSync(path.join(root, `icons/icon-${s}.png`)));
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((png, i) => {
    const size = [16, 32, 48][i], e = 6 + 16 * i;
    head.writeUInt8(size, e); head.writeUInt8(size, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.concat([head, ...pngs]));
  console.log('wrote favicon.ico');
  await browser.close();
})();
