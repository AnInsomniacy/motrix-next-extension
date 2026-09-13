import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';

const source = new URL('../assets/rayburst-connect.svg', import.meta.url);
const assets = new URL('../docs/store/assets/', import.meta.url);
const logo = await readFile(source, 'utf8');
await mkdir(assets, { recursive: true });
await copyFile(source, new URL('../test-site/favicon.svg', import.meta.url));

function artwork(width, height) {
  const compact = width < 600;
  const size = compact ? 126 : 340;
  const x = compact ? (width - size) / 2 : 72;
  const y = compact ? 16 : (height - size) / 2;
  const mark = logo
    .replace('<svg ', `<svg x="${x}" y="${y}" `)
    .replace('width="1024" height="1024"', `width="${size}" height="${size}"`);
  const textX = compact ? width / 2 : 460;
  const titleY = compact ? 183 : 266;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#18121F"/>
    ${mark}
    <g font-family="Segoe UI, Arial, sans-serif" text-anchor="${compact ? 'middle' : 'start'}">
      <text x="${textX}" y="${titleY}" fill="#F2EAFA" font-size="${compact ? 28 : 64}" font-weight="600">Rayburst Connect</text>
      <text x="${textX}" y="${titleY + (compact ? 36 : 60)}" fill="#D6BAFF" font-size="${compact ? 14 : 26}">Spot the source, hand it off seamlessly.</text>
    </g>
  </svg>`;
}

// Render at four times the target resolution before the final antialiased resize.
for (const [name, width, height] of [
  ['promo-small-440x280', 440, 280],
  ['promo-marquee-1400x560', 1400, 560],
]) {
  await sharp(Buffer.from(artwork(width, height)), { density: 288 })
    .resize(width, height)
    .png()
    .toFile(fileURLToPath(new URL(`${name}.png`, assets)));
}
