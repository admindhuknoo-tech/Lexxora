declare const process: any;
import fs from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'server', 'caseAnalysis.ts');
if (!fs.existsSync(target)) throw new Error(`Missing ${target}`);
let src = fs.readFileSync(target, 'utf8');

// Repair only the malformed V6.8.0 injection shape:
//   caseText: ...
//   canonicalSeeds,
// by inserting the missing comma after the preceding property.
const re = /(\n\s*[A-Za-z_$][\w$]*\s*:\s*[^,\n{}]+)(\n\s*canonicalSeeds\s*,)/m;
const m = src.match(re);
if (!m) {
  if (/canonicalSeeds\s*,/.test(src)) {
    console.log('No V6.8.0 comma-repair pattern found; source may already be repaired.');
    process.exit(0);
  }
  throw new Error('Guard failed: canonicalSeeds wiring not found. Source left unchanged.');
}

src = src.replace(re, (_all, prev, seed) => `${prev},${seed}`);
fs.writeFileSync(target, src, 'utf8');
console.log('Repaired V6.8.0 discoverOfficialLaw object comma in server/caseAnalysis.ts');
