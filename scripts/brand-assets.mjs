// Renders the PNG brand assets (social card and app icons) from public/favicon.svg and the
// self-hosted fonts, using the Playwright Chromium already installed for the e2e tests.
//   bun run brand
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("public/favicon.svg", "utf8");
const font = (f) =>
  `data:font/woff2;base64,${readFileSync(`public/fonts/${f}.woff2`).toString("base64")}`;

const card = `<style>
@font-face{font-family:F;src:url(${font("fraunces")});font-weight:100 900}
@font-face{font-family:P;src:url(${font("ibm-plex-sans")});font-weight:100 900}
body{margin:0;width:1200px;height:630px;background:#f9f5ec;color:#2a2018;display:flex;flex-direction:column;justify-content:space-between;padding:72px;box-sizing:border-box;font-family:P}
.brand{display:flex;align-items:center;gap:20px;font:600 40px F}
.brand svg{width:72px;height:72px}
h1{font:600 80px/1.08 F;margin:0;letter-spacing:-0.02em;white-space:nowrap}
h1 em{color:#b5532a;font-style:normal}
p{font-size:30px;margin:28px 0 0;color:#6b5d50;white-space:nowrap}
.url{font-size:28px;color:#6b5d50}
</style>
<div class="brand">${svg}mdstudio</div>
<div><h1>Write once.<br><em>Render the same everywhere.</em></h1>
<p>Faithful live preview and portability checks for GitHub, dev.to and Obsidian.</p></div>
<div class="url">mdstudio.deityhub.com</div>`;

// The mark has no background of its own, so app icons sit on the paper color with some padding.
const icon = (size) =>
  `<style>body{margin:0;width:${size}px;height:${size}px;background:#f9f5ec;display:grid;place-items:center}svg{width:${Math.round(size * 0.68)}px;height:${Math.round(size * 0.68)}px}</style>${svg}`;

const browser = await chromium.launch();
const shot = async (html, w, h, path) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path });
  await page.close();
  console.log(path);
};
await shot(card, 1200, 630, "public/og.png");
for (const [size, name] of [
  [180, "apple-touch-icon"],
  [192, "icon-192"],
  [512, "icon-512"],
])
  await shot(icon(size), size, size, `public/${name}.png`);

// favicon.ico: browsers that skip the SVG, and crawlers that request /favicon.ico directly. The mark
// sits on a rounded paper tile so it stays legible at 16px on light and dark tabs.
const tile = (size) =>
  `<style>body{margin:0;width:${size}px;height:${size}px;background:transparent}` +
  `.t{width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;background:#f9f5ec;display:grid;place-items:center}` +
  `svg{width:${Math.round(size * 0.78)}px;height:${Math.round(size * 0.78)}px}</style><div class="t">${svg}</div>`;

/** ICO container with one PNG image per size (supported since Windows Vista and by every browser). */
const buildIco = (images) => {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    head[at] = size; // width, 0 would mean 256
    head[at + 1] = size;
    head.writeUInt16LE(1, at + 4); // colour planes
    head.writeUInt16LE(32, at + 6); // bits per pixel
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
};

const icoImages = [];
for (const size of [16, 32, 48]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(tile(size));
  icoImages.push({ size, png: await page.screenshot({ omitBackground: true }) });
  await page.close();
}
writeFileSync("public/favicon.ico", buildIco(icoImages));
console.log("public/favicon.ico");
await browser.close();
