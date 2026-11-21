// Procedural news-image front page generator (Node 22, stdlib only, no network).
// Draws a 1024x1024 newspaper front page to a PNG written via a custom zlib encoder.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = r;
  img[i + 1] = g;
  img[i + 2] = b;
}

function rect(x: number, y: number, w: number, h: number, c: number[]): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPx(xx, yy, c[0], c[1], c[2]);
    }
  }
}

// 5x7 bitmap font. Each char: 7 rows, each row a 5-bit mask (bit 4 = leftmost col).
const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  'A': [0x04, 0x0a, 0x0a, 0x1f, 0x11, 0x11, 0x11],
  'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  'D': [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
  'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'I': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x1f],
  'J': [0x1f, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0e],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x11, 0x1f],
  'M': [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
  'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  'S': [0x0e, 0x10, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'V': [0x11, 0x11, 0x11, 0x11, 0x0a, 0x0a, 0x04],
  'W': [0x11, 0x11, 0x15, 0x15, 0x1b, 0x11, 0x11],
  'X': [0x11, 0x0a, 0x04, 0x04, 0x04, 0x0a, 0x11],
  'Y': [0x11, 0x0a, 0x04, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x01, 0x01, 0x0e, 0x10, 0x10, 0x1f],
  '3': [0x0e, 0x01, 0x01, 0x06, 0x01, 0x11, 0x0e],
  '4': [0x11, 0x11, 0x11, 0x1f, 0x01, 0x01, 0x01],
  '5': [0x1f, 0x10, 0x10, 0x1e, 0x01, 0x11, 0x0e],
  '6': [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x04, 0x04, 0x04],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x11, 0x0e],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04],
};

function charRows(ch: string): number[] | null {
  return FONT[ch] ?? null;
}

function text(x: number, y: number, str: string, scale: number, c: number[]): void {
  let cx = x;
  for (const ch of str) {
    const rows = charRows(ch);
    if (rows) {
      for (let r = 0; r < 7; r++) {
        const bits = rows[r];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            rect(cx + col * scale, y + r * scale, scale, scale, c);
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function measure(str: string, scale: number): number {
  return str.length * 6 * scale;
}

function centerX(str: string, scale: number): number {
  return (W - measure(str, scale)) / 2;
}

function wrap(str: string, maxW: number, scale: number): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (!cur || measure(trial, scale) <= maxW) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Palette
const INK = [20, 20, 20];
const PAPER = [250, 250, 248];
const NAVY = [15, 30, 70];
const PANEL = [242, 242, 240];

type Story = {
  tag: string;
  lines: string[];
  sub: string;
  fact: string;
};

const STORIES: Story[] = [
  {
    tag: 'CONFLICT',
    lines: ['RUSSIA STRIKES UKRAINE', 'MISSILES LAND IN POLAND'],
    sub: '400 DRONES AND 110 MISSILES OVERNIGHT',
    fact: 'RUSSIA FIRED MORE THAN 400 DRONES AND 110 MISSILES AT UKRAINE OVERNIGHT AT LEAST 8 PEOPLE KILLED IN KYIV TWO RUSSIAN MISSILES AND A SUSPECTED DRONE CAME DOWN IN POLAND PRIME MINISTER TUSK CALLED IT A DELIBERATE PROVOCATION',
  },
  {
    tag: 'MARKETS',
    lines: ['AI STOCKS TUMBLE', 'S AND P IN CORRECTION'],
    sub: 'US SHARES FALL 3.7 PERCENT',
    fact: 'US STOCKS FELL SHARPLY ON FRIDAY AS AN AI AND CHIP SELL OFF PUSHED THE S AND P 500 AND THE DOW INTO CORRECTION TERRITORY',
  },
  {
    tag: 'JUSTICE',
    lines: ['UK EXPELS MYANMAR ENVOY', 'AFTER GENOCIDE RULING'],
    sub: 'MYANMAR OBJECTS TO RULING',
    fact: 'THE UK EXPELLED MYANMAR S DIPLOMAT AFTER THE INTERNATIONAL COURT OF JUSTICE FOUND MYANMAR RESPONSIBLE FOR GENOCIDE AGAINST THE ROHINGYA THE FIRST TIME THE COURT HAS HELD A STATE RESPONSIBLE',
  },
  {
    tag: 'HEALTH',
    lines: ['CANCER PILL BREAKTHROUGH', 'TUMOURS VANISH IN TRIAL'],
    sub: '1 IN 12 PATIENTS CLEAR',
    fact: 'A TRIAL OF THE PILL DARAXONRASIB MADE PANCREATIC CANCER UNDETECTABLE ON SCANS IN ONE IN 12 PATIENTS',
  },
  {
    tag: 'GULF',
    lines: ['HOUTHI MISSILES DOWNED', 'AIMED AT RIYADH'],
    sub: 'THIRD NIGHT OF ALERTS',
    fact: 'THE SAUDI LED COALITION SHOT DOWN THREE HOUTHI BALLISTIC MISSILES HEADED FOR RIYADH THE THIRD NIGHT OF ALERTS',
  },
];

function drawTag(x: number, y: number, tag: string): void {
  const scale = 3;
  const pad = 8;
  const tagW = measure(tag, scale) + 20;
  const tagX = x + pad + (tagW - measure(tag, scale)) / 2;
  rect(x + pad, y + pad, tagW, 22, NAVY);
  text(tagX, y + pad + 5, tag, scale, [255, 255, 255]);
}

function drawPanel(x: number, y: number, w: number, s: Story, scale: number): number {
  const pad = 8;
  const border = 2;
  const factScale = 1;
  const factLines = wrap(s.fact, w - 2 * pad - 2 * border, factScale);
  const tagH = 22;
  const lineH = 7 * scale + 4;
  const subH = 7 * 3 + 4;
  const h =
    2 * border +
    2 * pad +
    tagH +
    10 +
    2 * lineH +
    6 +
    subH +
    6 +
    factLines.length * (7 * factScale + 2) +
    2 * pad;

  rect(x, y, w, h, PANEL);
  rect(x + border, y + border, w - 2 * border, h - 2 * border, PAPER);

  drawTag(x, y, s.tag);

  let ty = y + pad + tagH + 10;
  for (const ln of s.lines) {
    text(x + pad, ty, ln, scale, INK);
    ty += lineH;
  }
  ty += 6;
  text(x + pad, ty, s.sub, 3, INK);
  ty += subH + 6;
  for (const ln of factLines) {
    text(x + pad, ty, ln, factScale, INK);
    ty += 7 * factScale + 2;
  }
  return h;
}

function drawLead(x: number, y: number, w: number, s: Story): number {
  const pad = 12;
  const border = 2;
  const factScale = 1;
  const factLines = wrap(s.fact, w - 2 * pad - 2 * border, factScale);
  const scale = 3;
  const tagH = 30;
  const lineH = 7 * scale + 8;
  const subH = 7 * 3 + 6;
  const h =
    2 * border +
    2 * pad +
    tagH +
    12 +
    2 * lineH +
    8 +
    subH +
    8 +
    factLines.length * (7 * factScale + 2) +
    2 * pad;

  rect(x, y, w, h, PANEL);
  rect(x + border, y + border, w - 2 * border, h - 2 * border, PAPER);
  rect(x + border, y + border, w - 2 * border, tagH, NAVY);
  text(x + border + pad, y + border + 7, s.tag, 3, [255, 255, 255]);

  let ty = y + border + tagH + 14;
  for (const ln of s.lines) {
    text(x + pad, ty, ln, scale, INK);
    ty += lineH;
  }
  ty += 8;
  text(x + pad, ty, s.sub, 3, INK);
  ty += subH + 8;
  for (const ln of factLines) {
    text(x + pad, ty, ln, factScale, INK);
    ty += 7 * factScale + 2;
  }
  return h;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xedb88320;
      else crc = crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf: Buffer): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const b = Buffer.alloc(12 + len);
  b.writeUInt32BE(len, 0);
  b.write(type, 4, 4, 'ascii');
  data.copy(b, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  b.writeUInt32BE(crc, 8 + len);
  return b;
}

function encodePNG(): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < H; y++) {
    const line = Buffer.alloc(1 + W * 3);
    line[0] = 0; // no filter
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      line[1 + x * 3] = img[i];
      line[2 + x * 3] = img[i + 1];
      line[3 + x * 3] = img[i + 2];
    }
    rows.push(line);
  }
  const raw = Buffer.concat(rows);
  const deflate = deflateRawSync(raw);
  const adler = adler32(raw);
  const idat = Buffer.concat([
    Buffer.from([0x78, 0x9c]),
    deflate,
    Buffer.from([
      (adler >>> 24) & 0xff,
      (adler >>> 16) & 0xff,
      (adler >>> 8) & 0xff,
      adler & 0xff,
    ]),
  ]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))];
  return Buffer.concat(parts);
}

function main(): void {
  rect(0, 0, W, H, PAPER);

  // Masthead
  rect(0, 0, W, 126, NAVY);
  text(centerX('THE DAY IN NEWS', 5), 42, 'THE DAY IN NEWS', 5, [255, 255, 255]);
  text(centerX('SATURDAY 21 NOVEMBER 2026', 3), 100, 'SATURDAY 21 NOVEMBER 2026', 3, [255, 255, 255]);

  let y = 140;
  const leadH = drawLead(24, y, W - 48, STORIES[0]);
  y += leadH + 16;

  // 2x2 grid of the remaining four stories
  const gap = 20;
  const colW = (W - 48 - gap) / 2;
  for (let row = 0; row < 2; row++) {
    const h1 = drawPanel(24, y, colW, STORIES[1 + row * 2], 2);
    const h2 = drawPanel(24 + colW + gap, y, colW, STORIES[2 + row * 2], 2);
    y += Math.max(h1, h2) + 16;
  }

  // Footer band filling to the bottom (no empty band)
  rect(0, y, W, H - y, NAVY);
  text(centerX('SATURDAY 21 NOVEMBER 2026', 2), y + (H - y) / 2 - 7, 'SATURDAY 21 NOVEMBER 2026', 2, [255, 255, 255]);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG());
}

main();
