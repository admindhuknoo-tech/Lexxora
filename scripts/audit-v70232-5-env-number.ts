import assert from 'node:assert/strict';
import { envNumber } from '../server/localOcr';

type Case = {
  label: string;
  name: string;
  value?: string;
  fallback: number;
  min: number;
  max: number;
  expected: number;
};

const cases: Case[] = [
  { label:'unset uses fallback', name:'OCR_PAGE_TIMEOUT_MS', fallback:120_000, min:15_000, max:600_000, expected:120_000 },
  { label:'empty uses fallback', name:'OCR_PAGE_TIMEOUT_MS', value:'', fallback:120_000, min:15_000, max:600_000, expected:120_000 },
  { label:'whitespace uses fallback', name:'OCR_PAGE_TIMEOUT_MS', value:'   ', fallback:120_000, min:15_000, max:600_000, expected:120_000 },
  { label:'invalid uses fallback', name:'OCR_PAGE_TIMEOUT_MS', value:'abc', fallback:120_000, min:15_000, max:600_000, expected:120_000 },
  { label:'valid override preserved', name:'OCR_PAGE_TIMEOUT_MS', value:'90000', fallback:120_000, min:15_000, max:600_000, expected:90_000 },
  { label:'below minimum clamps', name:'OCR_PAGE_TIMEOUT_MS', value:'1', fallback:120_000, min:15_000, max:600_000, expected:15_000 },
  { label:'above maximum clamps', name:'OCR_PAGE_TIMEOUT_MS', value:'9999999', fallback:120_000, min:15_000, max:600_000, expected:600_000 },
  { label:'render timeout default', name:'OCR_RENDER_TIMEOUT_MS', fallback:60_000, min:10_000, max:300_000, expected:60_000 },
  { label:'page watchdog default', name:'OCR_PAGE_WATCHDOG_MS', fallback:240_000, min:30_000, max:900_000, expected:240_000 },
  { label:'max pages default', name:'OCR_MAX_PAGES', fallback:150, min:50, max:500, expected:150 },
  { label:'dpi default', name:'OCR_PDF_DPI', fallback:160, min:120, max:300, expected:160 },
  { label:'worker default', name:'OCR_WORKERS', fallback:2, min:1, max:8, expected:2 },
];

let passed = 0;
for (const c of cases) {
  const before = process.env[c.name];
  try {
    if (c.value === undefined) delete process.env[c.name];
    else process.env[c.name] = c.value;
    const actual = envNumber(c.name, c.fallback, c.min, c.max);
    assert.equal(actual, c.expected, `${c.label}: expected ${c.expected}, got ${actual}`);
    console.log(`PASS ${c.label}: ${actual}`);
    passed += 1;
  } finally {
    if (before === undefined) delete process.env[c.name];
    else process.env[c.name] = before;
  }
}

console.log(`RESULT ${passed}/${cases.length}`);
