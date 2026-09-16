declare const process: any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { inferLegalContext } from '../server/legalOntology';
import { reasonForensically } from '../server/forensicReasoner';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// ============================================================
// Fixture: Case-Analysis (8) yang memicu defect.
// ============================================================
const fixture = `Bagus ditangkap dan ditahan polisi polres Sidoarjo atas laporan Rahmad. Bagus menyewa mobil Inova Reborn milik Rahmad dengan biaya sewa 9juta rupiah setiap bulan, tetapi Agus menggadaikan mobil tersebut kepada Andi senilai 100jt rupiah. Pada waktu Rahmad ingin menarik mobilnya didapatkan mobilnya tidak ada, katanya Bagus berada di Andik, ternyata oleh Andi digadaikan lagi kepada Putut senilai 150jt rupiah.`;

const em = buildEvidenceModel(fixture);

// Locate each actor.
const byName = new Map<string, any>();
for (const a of em.actors) byName.set(String(a.actor).toLowerCase(), a);

// ============================================================
// CHECK 1 — Actor extraction still finds all five actors
// ============================================================
for (const name of ['Bagus', 'Agus', 'Rahmad', 'Andi', 'Putut']) {
  check(`1.${name} extracted as actor`,
    byName.has(name.toLowerCase()),
    `actors=${[...byName.keys()].join(',')}`);
}

// ============================================================
// CHECK 2 — Each actor's evidence_quotes reference that actor,
// not another party's sentence.
// ============================================================
for (const [label, queries] of [
  ['Agus',    [/Agus/i]],
  ['Andi',    [/Andi/i]],
  ['Putut',   [/Putut/i]],
  ['Rahmad',  [/Rahmad/i]],
  ['Bagus',   [/Bagus/i]],
] as Array<[string, RegExp[]]>) {
  const actor = byName.get(label.toLowerCase());
  if (!actor) { check(`2.${label} actor present`, false); continue; }
  const quotes: string[] = actor.evidence_quotes || [];
  const anyMatches = quotes.some(q => queries.every(re => re.test(q)));
  check(`2.${label} evidence_quotes mention ${label}`, anyMatches,
    `quotes=${quotes.map(q => q.slice(0, 80)).join(' || ')}`);
}

// ============================================================
// CHECK 3 — Agus must NOT be bound to the Bagus arrest sentence
// ============================================================
{
  const agus = byName.get('agus');
  const quotes: string[] = agus?.evidence_quotes || [];
  const wronglyBoundToBagusArrest = quotes.some(
    q => /Bagus\s+ditangkap\s+dan\s+ditahan/i.test(q) && !/Agus/i.test(q),
  );
  check('3.1 Agus is not bound to the Bagus arrest sentence',
    !wronglyBoundToBagusArrest,
    `quotes=${quotes.map(q => q.slice(0, 80)).join(' || ')}`);
}

// ============================================================
// CHECK 4 — Sentence-scoped quotes are shorter than the full text
// (regression: no accidental passage-wide window).
// ============================================================
{
  const anyOverlong = em.actors.some((a: any) =>
    (a.evidence_quotes || []).some((q: string) => q.length >= fixture.length - 10),
  );
  check('4.1 No actor quote spans almost the entire document',
    !anyOverlong);
}



// ============================================================
// CHECK 5 — Downstream actor_matrix must use token-aware provenance.
// "Agus" must not match the substring inside "Bagus".
// ============================================================
{
  const ctx = inferLegalContext(fixture);
  const reasoning = reasonForensically({
    title: 'Actor provenance audit',
    primaryDomain: ctx.primary.label,
    domainContext: ctx,
    evidence: em,
    lawCandidates: [],
  });
  const agusRow = reasoning.actor_matrix.find((r: any) => String(r.actor).toLowerCase() === 'agus');
  const tag = String(agusRow?.evidence_tag || '');
  check('5.1 actor_matrix Agus provenance mentions Agus', /Agus/i.test(tag), `tag=${tag}`);
  check('5.2 actor_matrix Agus provenance is not Bagus-only arrest sentence',
    !(/Bagus\s+ditangkap\s+dan\s+ditahan/i.test(tag) && !/Agus/i.test(tag)),
    `tag=${tag}`);
}

// ============================================================
// CHECK 6 — Legal-reference lexical/entity integrity.
// Citation fragments are not people; Perumda is an organization.
// ============================================================
{
  const legalRef = `Bahwa sesuai dengan Surat Edaran Jaksa Agung Nomor SE-004/J.A/11/1993 tentang Pembuatan Surat Dakwaan. ELYA DWI ADMOKO, M.M yang melakukan perbuatan melawan hukum dalam kapasitasnya sebagai Direktur Utama Perumda BPR Kota Blitar pada tahun 2022.`;
  const refModel = buildEvidenceModel(legalRef);
  const names = refModel.actors.map((a: any) => String(a.actor));
  check('6.1 citation fragment Agung Nomor SE is not an actor',
    !names.some(n => /^Agung\s+Nomor\s+SE$/i.test(n)),
    `actors=${names.join(',')}`);
  const perumda = refModel.actors.find((a: any) => /^Perumda\s+BPR\s+Kota\s+Blitar$/i.test(String(a.actor)));
  check('6.2 Perumda BPR Kota Blitar is typed as organization',
    !!perumda && perumda.entity_type === 'ORGANIZATION',
    `entity=${perumda ? JSON.stringify({actor:perumda.actor,type:perumda.entity_type}) : 'missing'}`);
}

console.log(`\n${pass}/${pass + fail} actor-provenance-v684 checks PASS`);
if (fail) process.exit(1);
