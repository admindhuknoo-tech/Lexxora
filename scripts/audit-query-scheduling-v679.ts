declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { inferLegalContext, officialQueriesForContext } from '../server/legalOntology';
import { buildAuthorityProviderPlan } from '../server/officialLawRetriever';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const ontologyPath = path.join(process.cwd(), 'server', 'legalOntology.ts');
const retrieverPath = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
const ontologySrc = fs.readFileSync(ontologyPath, 'utf8');
const retrieverSrc = fs.readFileSync(retrieverPath, 'utf8');

check('1.1 phrase-aware decomposition installed', /function phraseAwareDecompose\s*\(/.test(ontologySrc));
check('1.2 fair scheduler installed', /function scheduleQueryPlans\s*\(/.test(ontologySrc));
check('1.3 total generated-query cap remains 20', /MAX_OFFICIAL_QUERIES\s*=\s*20/.test(ontologySrc));
const providerPlanProbe=buildAuthorityProviderPlan(['a','b','c','d','e','f','g','h','i','j','k'],'hybrid');
check('1.4 provider-aware network plan remains bounded <=10 with reserved judicial slots', providerPlanProbe.total_query_slots<=10 && providerPlanProbe.regulation_queries.length<=6 && providerPlanProbe.judicial_product_queries.length<=2 && providerPlanProbe.case_law_queries.length<=2, JSON.stringify(providerPlanProbe));

const fixture = `
Perjanjian jual beli tanah antara Agnes dan Irma dituangkan dalam PPJB.
Pembayaran dilakukan bertahap dan sisa pembayaran dilakukan setelah pemecahan sertifikat SHM selesai.
Penjual belum menyelesaikan pemecahan sertifikat dan belum melakukan AJB maupun balik nama.
Pembeli telah melakukan somasi dan meminta pembatalan perjanjian, pengembalian pembayaran,
ganti rugi karena wanprestasi. Objek tanah kemudian akan dialihkan kepada pihak ketiga.
Hak atas tanah dan pendaftaran tanah di BPN menjadi persoalan.
`;

const context = inferLegalContext(fixture);
const queries = officialQueriesForContext(fixture);
const first8 = queries.slice(0, 8);
const hasAgraria = first8.some(q => /\b(tanah|ppjb|ajb|sertifikat|pendaftaran|agraria)\b/i.test(q));
const hasPerdata = first8.some(q => /\b(perjanjian|perikatan|wanprestasi|somasi|prestasi)\b/i.test(q));
const hasPhrasePreservation = queries.some(q => /peralihan hak karena jual beli\s+ppjb/i.test(q));
const hasLegacyLongAgrariaParent = queries.some(q => /peralihan hak karena jual beli ppjb ajb kewenangan mengalihkan hak hak atas tanah pendaftaran tanah sertifikat/i.test(q));
const noDuplicates = new Set(queries).size === queries.length;
const maxRealTokens = Math.max(...queries.map(q => q.toLowerCase().split(/\s+/).filter(t => t.length >= 3).length));

check('2.1 fixture primary domain is contractual civil', context.primary.id === 'PERDATA_KONTRAKTUAL', `primary=${context.primary.id}`);
check('2.2 fixture keeps agraria as active secondary', context.secondary.some(x => x.id === 'AGRARIA_PERTANAHAN'), `secondary=${context.secondary.map(x => x.id).join(',')}`);
check('2.3 first 8 contain primary-domain query', hasPerdata, `first8=${JSON.stringify(first8)}`);
check('2.4 first 8 contain agraria query (no starvation)', hasAgraria, `first8=${JSON.stringify(first8)}`);
check('2.5 semantic phrase preserved', hasPhrasePreservation, `queries=${JSON.stringify(queries)}`);
check('2.6 old long agraria parent is not reintroduced', !hasLegacyLongAgrariaParent);
check('2.7 generated queries remain bounded', maxRealTokens <= 6, `maxRealTokens=${maxRealTokens}`);
check('2.8 query list has no duplicates', noDuplicates);
check('2.9 query list respects cap <=20', queries.length <= 20, `count=${queries.length}`);

console.log('\nFIRST 8 SCHEDULED QUERIES');
first8.forEach((q, i) => console.log(`${i + 1}. ${q}`));
console.log(`\n${pass}/${pass + fail} query-scheduling-v679 checks PASS`);
if (fail) process.exit(1);
