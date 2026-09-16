declare const process: any;
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
if (!fs.existsSync(file)) throw new Error('Missing ' + file);
let src = fs.readFileSync(file, 'utf8');
const original = src;

function requirePattern(re: RegExp, message: string) {
  if (!re.test(src)) throw new Error(message);
}

requirePattern(/export interface CanonicalSeed\s*\{/, 'V6.8 baseline missing: CanonicalSeed interface not found.');
requirePattern(/async function resolveCanonicalSeeds\s*\(/, 'V6.8 baseline missing: resolveCanonicalSeeds not found.');
requirePattern(/canonicalAuthorities\?\s*:/, 'discoverOfficialLaw canonicalAuthorities input not found.');
requirePattern(/(?:export\s+)?function parseQueryIdentity\s*\(/, 'parseQueryIdentity not found.');

// A. Install parser + normalizer before CanonicalSeed.
if (!/function parseCanonicalIdentities\s*\(/.test(src)) {
  const marker = 'export interface CanonicalSeed {';
  const helperLines = [
    '// ============================================================',
    '// CANONICAL AUTHORITY CONTRACT NORMALIZATION (V6.8.1a)',
    '// ------------------------------------------------------------',
    '// Accept legacy string labels and CanonicalSeed objects.',
    '// Compound labels joined by jo/jo. are split and parsed by',
    '// parseQueryIdentity(). No regulation identity is hardcoded.',
    '// ============================================================',
    'interface CanonicalIdentity {',
    '  instrument_family: string;',
    '  number: string;',
    '  year: number;',
    '}',
    '',
    'function parseCanonicalIdentities(label: string): CanonicalIdentity[] {',
    "  const raw = String(label || '').trim();",
    '  if (!raw) return [];',
    '',
    '  const segments = raw',
    '    .split(/\\s+jo\\.?\\s+/i)',
    '    .map(s => s.trim())',
    '    .filter(Boolean);',
    '',
    '  const out: CanonicalIdentity[] = [];',
    '  const seen = new Set<string>();',
    '',
    '  for (const seg of segments.length ? segments : [raw]) {',
    '    const id = parseQueryIdentity(seg);',
    '    if (!id.exact || !id.instrument_family || !id.number || !id.year) continue;',
    '',
    "    const key = String(id.instrument_family) + '|' + String(id.number).trim() + '|' + String(Number(id.year));",
    '    if (seen.has(key)) continue;',
    '    seen.add(key);',
    '',
    '    out.push({',
    '      instrument_family: String(id.instrument_family),',
    '      number: String(id.number).trim(),',
    '      year: Number(id.year),',
    '    });',
    '  }',
    '',
    '  return out;',
    '}',
    '',
    'export function normalizeCanonicalAuthorities(',
    '  values: Array<string | CanonicalSeed>,',
    '): CanonicalSeed[] {',
    '  const out: CanonicalSeed[] = [];',
    '  const seen = new Set<string>();',
    '',
    '  for (const value of values) {',
    "    if (typeof value === 'string') {",
    '      const identities = parseCanonicalIdentities(value);',
    '      for (const id of identities) {',
    "        const key = id.instrument_family + '|' + id.number + '|' + String(id.year);",
    '        if (seen.has(key)) continue;',
    '        seen.add(key);',
    '',
    '        out.push({',
    '          localRegulationId: value,',
    '          canonical_label: value,',
    '          instrument_family: id.instrument_family,',
    '          number: id.number,',
    '          year: id.year,',
    '        });',
    '      }',
    '      continue;',
    '    }',
    '',
    "    if (!value || typeof value !== 'object') continue;",
    '    if (!value.instrument_family || !value.number || !value.year) continue;',
    '',
    "    const key = String(value.instrument_family) + '|' + String(value.number).trim() + '|' + String(value.year);",
    '    if (seen.has(key)) continue;',
    '    seen.add(key);',
    '',
    '    out.push({',
    "      localRegulationId: value.localRegulationId || value.canonical_label || '',",
    "      canonical_label: value.canonical_label || '',",
    '      instrument_family: String(value.instrument_family),',
    '      number: String(value.number).trim(),',
    '      year: Number(value.year),',
    '    });',
    '  }',
    '',
    '  return out.slice(0, CANONICAL_SEED_MAX);',
    '}',
    '',
  ];
  const helper = helperLines.join('\n');
  if (!src.includes(marker)) throw new Error('Cannot locate CanonicalSeed insertion point.');
  src = src.replace(marker, helper + marker);
}

// B. Public contract accepts current string[] bridge and canonical objects.
src = src.replace(
  /canonicalAuthorities\?\s*:\s*CanonicalSeed\[\]\s*;/,
  'canonicalAuthorities?: Array<string | CanonicalSeed>;'
);
if (!/canonicalAuthorities\?\s*:\s*Array<string\s*\|\s*CanonicalSeed>\s*;/.test(src)) {
  throw new Error('Could not normalize canonicalAuthorities contract.');
}

// C. Normalize before resolveCanonicalSeeds.
const oldSeedBlock = /const seedEnabled\s*=\s*Array\.isArray\(input\.canonicalAuthorities\)\s*&&\s*input\.canonicalAuthorities\.length\s*>\s*0;\s*\n\s*const seed\s*=\s*seedEnabled\s*\n\s*\?\s*await resolveCanonicalSeeds\(input\.mode,\s*input\.canonicalAuthorities!,\s*input\.tempusYear\)\s*\n\s*:\s*\{\s*candidates:\s*\[\],\s*attempts:\s*\[\]\s*as\s*Array<\{\s*seed:\s*CanonicalSeed;\s*attempts:\s*ExactProviderAttempt\[\]\s*\}>\s*\};/;
const newSeedBlock = [
  'const normalizedCanonicalSeeds = normalizeCanonicalAuthorities(input.canonicalAuthorities || []);',
  '  const seedEnabled = normalizedCanonicalSeeds.length > 0;',
  '  const seed = seedEnabled',
  '    ? await resolveCanonicalSeeds(input.mode, normalizedCanonicalSeeds, input.tempusYear)',
  '    : { candidates: [], attempts: [] as Array<{ seed: CanonicalSeed; attempts: ExactProviderAttempt[] }> };',
].join('\n');

if (oldSeedBlock.test(src)) {
  src = src.replace(oldSeedBlock, newSeedBlock);
} else if (!/const normalizedCanonicalSeeds\s*=\s*normalizeCanonicalAuthorities\(input\.canonicalAuthorities\s*\|\|\s*\[\]\)/.test(src)) {
  throw new Error('Canonical seed resolution block differs from audited V6.8.0b source; aborting.');
}

// D. Diagnostics.
const oldDiag = /diagnostics\.canonical_authorities_attempted\s*=\s*input\.canonicalAuthorities\?\.length\s*\|\|\s*0\s*;\s*\n\s*diagnostics\.canonical_authorities_resolved\s*=\s*seed\.candidates\.length\s*;/;
if (oldDiag.test(src)) {
  const newDiag = [
    'diagnostics.canonical_authorities_input_count=input.canonicalAuthorities?.length||0;',
    '  diagnostics.canonical_authorities_attempted=normalizedCanonicalSeeds.length;',
    '  diagnostics.canonical_authorities_resolved=seed.candidates.length;',
    '  diagnostics.canonical_authorities_normalized=normalizedCanonicalSeeds.map(s=>({',
    '    localRegulationId:s.localRegulationId,',
    '    instrument_family:s.instrument_family,',
    '    number:s.number,',
    '    year:s.year,',
    '  }));',
  ].join('\n');
  src = src.replace(oldDiag, newDiag);
}
if (!/diagnostics\.canonical_authorities_input_count/.test(src) || !/diagnostics\.canonical_authorities_normalized/.test(src)) {
  throw new Error('Could not install V6.8.1 canonical diagnostics.');
}

// E. __test__ export; preserve existing exports.
const testObj = /export const __test__\s*=\s*\{([\s\S]*?)\n\};/;
const match = src.match(testObj);
if (!match) throw new Error('__test__ export not found; refusing blind mutation.');
let body = match[1];
if (!/\bnormalizeCanonicalAuthorities\b/.test(body)) body += '\n  normalizeCanonicalAuthorities,';
if (!/\bparseCanonicalIdentities\b/.test(body)) body += '\n  parseCanonicalIdentities,';
src = src.replace(testObj, 'export const __test__ = {' + body + '\n};');

// Safety invariants.
const normStart = src.indexOf('CANONICAL AUTHORITY CONTRACT NORMALIZATION');
const normEnd = src.indexOf('export interface CanonicalSeed', normStart);
const normBlock = normStart >= 0 && normEnd > normStart ? src.slice(normStart, normEnd) : '';
const forbidden = /\bPP\s+24\s+Tahun\s+1997|\bUU\s+5\s+Tahun\s+1960|\bPP\s+18\s+Tahun\s+2021|\bUU\s+13\s+Tahun\s+2003/gi;
if (forbidden.test(normBlock)) throw new Error('Regulation-specific hardcode detected in normalization block.');
if (!/resolveCanonicalSeeds\(input\.mode,\s*normalizedCanonicalSeeds,\s*input\.tempusYear\)/.test(src)) throw new Error('Normalized seed wiring missing.');
if (!/canonicalAuthorities\?\s*:\s*Array<string\s*\|\s*CanonicalSeed>/.test(src)) throw new Error('Normalized public contract missing.');

if (src === original) {
  console.log('NOOP | V6.8.1a already applied.');
  process.exit(0);
}

const backup = file + '.v681a.bak';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');
fs.writeFileSync(file, src, 'utf8');

console.log('APPLIED | V6.8.1a canonical authority contract normalization');
console.log('OK | string[] and CanonicalSeed[] accepted at retriever boundary');
console.log('OK | compound jo/jo. labels expand into independent exact identities');
console.log('OK | resolveCanonicalSeeds receives normalized CanonicalSeed[]');
console.log('OK | diagnostics distinguish input, normalized attempts, and resolved candidates');
console.log('OK | no regulation-specific hardcode added');
