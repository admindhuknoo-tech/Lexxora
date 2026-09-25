import { readFileSync } from 'node:fs';
import { officialQueriesForContext } from '../server/legalOntology';
import { buildOfficialLawQueries } from '../server/officialLawRetriever';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  if (ok) pass++; else fail++;
}

const text = `A. Perihal : Jual beli tanah. Para pihak: Agnes, Irma (Klien), Imam, Hendra.
Sekira tahun 2023 terjadi kesepakatan Jual Beli antara Agnes dan Irma. Agnes membeli sebidang tanah dari Imam dengan legalitas obyek tanah SHM.
Agnes menjual kembali tanah berdasarkan girik karena SHM belum dipecah. Berdasarkan Surat Notaris Pengikatan Jual beli Irma melakukan pembayaran bertahap DP 110Jt dan tahap kedua saat keluar AJB dan lunas ketika terima SHM.
AJB tidak kunjung dibuat. Dibuat kesepakatan pembatalan Jual Beli dan Irma meminta kembali uang. Agnes melakukan upaya pemecahan SHM untuk menjual lahan kepada Hendra.
Agnes menghindar. Irma akan melakukan upaya hukum.`;

const oldLongConditional = 'syarat perjanjian prestasi bersyarat pembayaran bertahap wanprestasi perjanjian perikatan';
const oldLongAgraria = 'peralihan hak karena jual beli PPJB AJB kewenangan mengalihkan hak hak atas tanah pendaftaran tanah sertifikat';

const ontology = officialQueriesForContext(text);
check('ontology query count <= 20', ontology.length <= 20, `count=${ontology.length}`);
check('conditional long query decomposed', !ontology.includes(oldLongConditional));
check('conditional semantic query preserved', ontology.includes('syarat perjanjian prestasi bersyarat pembayaran bertahap'));
check('conditional query remains token-bounded', ontology.filter(q=>q.includes('syarat perjanjian')).every(q=>q.split(/\s+/).filter(Boolean).length<=6));
check('old agraria parent query not emitted', !ontology.includes(oldLongAgraria));
check('ontology contains agraria-decomposed material', ontology.some(q => /peralihan|sertifikat|agraria|pertanahan/.test(q)), ontology.filter(q => /peralihan|sertifikat|agraria|pertanahan/.test(q)).join(' || '));

const built = buildOfficialLawQueries({
  title: 'Tanah',
  domain: 'Hukum Perdata & Perikatan',
  text,
  issues: [
    { id: 'conditional-performance', query_terms: ['syarat perjanjian','prestasi bersyarat','pembayaran bertahap'] },
    { id: 'land-sale-chain', query_terms: ['peralihan hak karena jual beli','PPJB','AJB','kewenangan mengalihkan hak','hak atas tanah','pendaftaran tanah','sertifikat','pemecahan sertifikat'] },
  ],
});
check('build query count <= 20', built.length <= 20, `count=${built.length}`);
check('build does not re-inject issueQueries parent', !built.includes(oldLongConditional) && !built.includes(oldLongAgraria));
check('build preserves ontology semantic query', built.includes('syarat perjanjian prestasi bersyarat pembayaran bertahap'));

const withCitation = buildOfficialLawQueries({
  title: 'Analisis Kasus',
  domain: 'Hukum Perdata & Perikatan',
  text,
  explicitLawCitations: ['UU Nomor 5 Tahun 1960'],
});
check('explicit citation remains first-class query', withCitation[0] === 'UU Nomor 5 Tahun 1960', `first=${withCitation[0]}`);

const retrieverSource = readFileSync(new URL('../server/officialLawRetriever.ts', import.meta.url), 'utf8');
check('provider-aware network budget installed', /buildAuthorityProviderPlan\s*\(/.test(retrieverSource) && /regulationBudget=6/.test(retrieverSource) && /judicialProductBudget=2/.test(retrieverSource) && /caseLawBudget=2/.test(retrieverSource));
check('legacy issueQueries branch removed', !/const\s+issueQueries\s*=/.test(retrieverSource));

console.log(`\n${pass}/${pass + fail} V6.7.7 checks PASS`);
if (fail) process.exit(1);
