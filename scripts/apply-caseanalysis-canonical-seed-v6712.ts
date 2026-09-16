import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'server', 'caseAnalysis.ts');
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
let src = fs.readFileSync(file, 'utf8');

if (src.includes('canonicalAuthorities: canonicalAuthoritySeeds')) {
  console.log('V6.7.12 caseAnalysis integration already applied.');
  process.exit(0);
}

if (!src.includes('const matchedRegs')) throw new Error('Guard failed: const matchedRegs not found. Refusing to patch stale/unknown caseAnalysis.ts.');
if (!src.includes('buildOfficialLawQueries')) throw new Error('Guard failed: buildOfficialLawQueries not found.');
if (!src.includes('discoverOfficialLaw')) throw new Error('Guard failed: discoverOfficialLaw not found.');

const queryBuildRe = /(const\s+officialQueries\s*=\s*buildOfficialLawQueries\([\s\S]*?\);)/;
const qb = src.match(queryBuildRe);
if (!qb) throw new Error('Guard failed: officialQueries build call shape not recognized. No file changes made.');

const seedBlock = `\n\n  // V6.7.12 — canonical authority seed bridge.\n  // Local corpus remains an INDEX, not authority. Only strong corpus matches\n  // contribute exact identity strings; the official retriever must resolve\n  // family/number/year against an official source before they can become\n  // IDENTITY_VERIFIED candidates. No regulation number is hard-coded here.\n  const canonicalAuthoritySeeds = unique((matchedRegs || [])\n    .filter((m:any) => {\n      const conf = safeString(m?.material_confidence || '').toUpperCase();\n      if (conf) return conf === 'HIGH' || conf === 'MEDIUM';\n      const phraseHits = Number(m?.issue_phrase_hits || 0);\n      const issueHits = Number(m?.issue_hits || 0);\n      const anchorHits = Number(m?.anchor_hits || 0);\n      const relevance = Number(m?.relevance_score || 0);\n      return phraseHits > 0 || issueHits >= 2 || (anchorHits >= 2 && relevance >= 0.60);\n    })\n    .map((m:any) => safeString(m?.regulation?.nomor))\n    .filter((x:string) => /\\b(?:uu|undang[- ]undang|pp|peraturan\\s+pemerintah|perppu|perpres|peraturan\\s+presiden|permen|peraturan\\s+menteri)\\b/i.test(x) && /\\b(?:no\\.?|nomor)\\s*[0-9a-z./-]+\\s+tahun\\s+(?:19|20)\\d{2}\\b/i.test(x))\n  ).slice(0, 6);`;

src = src.replace(queryBuildRe, `$1${seedBlock}`);

const callStart = src.indexOf('await discoverOfficialLaw({');
if (callStart < 0) throw new Error('Guard failed: discoverOfficialLaw object call not found. No file changes made.');
const callEnd = src.indexOf('});', callStart);
if (callEnd < 0) throw new Error('Guard failed: discoverOfficialLaw call end not found. No file changes made.');
const call = src.slice(callStart, callEnd + 3);
if (!/queries\s*:\s*officialQueries/.test(call)) throw new Error('Guard failed: discoverOfficialLaw call does not use officialQueries. No file changes made.');

let patchedCall: string;
if (/caseText\s*:/.test(call)) {
  patchedCall = call.replace(/(caseText\s*:\s*[^,}\n]+\s*,?)/, `$1 canonicalAuthorities: canonicalAuthoritySeeds,`);
} else {
  patchedCall = call.replace(/}\);$/, `, canonicalAuthorities: canonicalAuthoritySeeds });`);
}

src = src.slice(0, callStart) + patchedCall + src.slice(callEnd + 3);

if (!src.includes('canonicalAuthorities: canonicalAuthoritySeeds')) throw new Error('Postcondition failed: canonicalAuthorities bridge missing.');
if (!src.includes('const canonicalAuthoritySeeds')) throw new Error('Postcondition failed: canonicalAuthoritySeeds missing.');

fs.writeFileSync(file, src, 'utf8');
console.log('Applied V6.7.12 canonical authority seed bridge to server/caseAnalysis.ts');
