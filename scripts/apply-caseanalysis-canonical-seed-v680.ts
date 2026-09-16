declare const process: any;
import fs from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'server', 'caseAnalysis.ts');
if (!fs.existsSync(target)) throw new Error(`Missing ${target}`);
let src = fs.readFileSync(target, 'utf8');

if (/function\s+extractCanonicalSeedsFromMatches\s*\(/.test(src) && /canonicalSeeds\s*,?\s*\n?\s*\}/.test(src)) {
  console.log('V6.8.0 canonical seed bridge already present; no changes made.');
  process.exit(0);
}

// 1) Extend existing officialLawRetriever import without replacing the whole import block.
const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/officialLawRetriever['"];?/m;
const im = src.match(importRe);
if (!im) throw new Error('Guard failed: officialLawRetriever import not found. Source left unchanged.');
let names = im[1].split(',').map((x:string)=>x.trim()).filter(Boolean);
for (const n of ['parseQueryIdentity','CanonicalSeed']) if (!names.includes(n)) names.push(n);
const newImport = `import { ${names.join(', ')} } from './officialLawRetriever';`;
src = src.replace(importRe, newImport);

// 2) Insert generic extractor directly before runCaseAnalysis.
const runMarker = /export\s+async\s+function\s+runCaseAnalysis\s*\(/;
const rm = src.match(runMarker);
if (!rm || rm.index == null) throw new Error('Guard failed: runCaseAnalysis marker not found. Source left unchanged.');
const helper = `\n// ============================================================\n// CANONICAL AUTHORITY SEED EXTRACTION (V6.8.0)\n// ------------------------------------------------------------\n// Data-driven: identities come from ranked local corpus matches.\n// No regulation number is hardcoded in this bridge.\n// ============================================================\nfunction extractCanonicalSeedsFromMatches(matchedRegs: any[]): CanonicalSeed[] {\n  const seeds: CanonicalSeed[] = [];\n  const seen = new Set<string>();\n\n  for (const m of matchedRegs || []) {\n    const reg = m?.regulation;\n    if (!reg || !reg.nomor) continue;\n    if (m?.material_confidence === 'LOW') continue;\n\n    const identity = parseQueryIdentity(String(reg.nomor));\n    if (!identity.exact || !identity.instrument_family || !identity.number || !identity.year) continue;\n\n    const key = \`${'${identity.instrument_family}'}|${'${String(identity.number).trim()}'}|${'${Number(identity.year)}'}\`;\n    if (seen.has(key)) continue;\n    seen.add(key);\n\n    seeds.push({\n      localRegulationId: String(reg.id || reg.nomor),\n      canonical_label: String(reg.nomor),\n      instrument_family: String(identity.instrument_family),\n      number: String(identity.number).trim(),\n      year: Number(identity.year),\n    });\n  }\n\n  return seeds.slice(0, 6);\n}\n\n`;
src = src.slice(0, rm.index) + helper + src.slice(rm.index);

// 3) Locate the discoverOfficialLaw object call and wire canonicalSeeds.
const callNeedle = 'const officialLawRetrieval = await discoverOfficialLaw({';
const callStart = src.indexOf(callNeedle);
if (callStart < 0) throw new Error('Guard failed: discoverOfficialLaw assignment not found. Source left unchanged.');

// Ensure matchedRegs exists before retrieval call.
const beforeCall = src.slice(0, callStart);
if (!/\bconst\s+matchedRegs\b/.test(beforeCall) && !/\blet\s+matchedRegs\b/.test(beforeCall)) {
  throw new Error('Guard failed: matchedRegs is not defined before discoverOfficialLaw. Source left unchanged.');
}

src = src.slice(0, callStart) + 'const canonicalSeeds = extractCanonicalSeedsFromMatches(matchedRegs);\n\n' + src.slice(callStart);
const shiftedStart = src.indexOf(callNeedle);
const objOpen = src.indexOf('{', shiftedStart);
let depth = 0, end = -1;
for (let i = objOpen; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
if (end < 0) throw new Error('Guard failed: could not parse discoverOfficialLaw object. Source left unchanged.');
const callBody = src.slice(objOpen + 1, end);
if (!/\bcanonicalSeeds\b/.test(callBody)) {
  const indentMatch = callBody.match(/\n(\s+)\w/);
  const indent = indentMatch ? indentMatch[1] : '    ';
  const trimmed = callBody.replace(/\s*$/, '');
  const withComma = /,\s*$/.test(trimmed) ? trimmed : `${trimmed},`;
  const injectedBody = withComma + `\n${indent}canonicalSeeds,\n`;
  src = src.slice(0, objOpen + 1) + injectedBody + src.slice(end);
}

// Final guards.
if (!/function\s+extractCanonicalSeedsFromMatches\s*\(/.test(src)) throw new Error('Post-guard failed: helper missing.');
if (!/canonicalSeeds\s*,/.test(src)) throw new Error('Post-guard failed: canonicalSeeds not wired.');
if (!/parseQueryIdentity/.test(src) || !/CanonicalSeed/.test(src)) throw new Error('Post-guard failed: imports missing.');

fs.writeFileSync(target, src, 'utf8');
console.log('Applied V6.8.0 canonical authority seed bridge to server/caseAnalysis.ts');
