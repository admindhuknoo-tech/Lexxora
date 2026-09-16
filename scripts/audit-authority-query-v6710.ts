declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { inferLegalContext, officialQueriesForContext } from '../server/legalOntology';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const ontologyPath = path.join(process.cwd(), 'server', 'legalOntology.ts');
const retrieverPath = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
const ontologySrc = fs.readFileSync(ontologyPath, 'utf8');
const retrieverSrc = fs.readFileSync(retrieverPath, 'utf8');

check('1.1 authority-oriented expansion installed', /function authorityOrientedQuery\s*\(/.test(ontologySrc));
check('1.2 authority query budget fixed at 6', /AUTHORITY_QUERY_TOKEN_BUDGET\s*=\s*6/.test(ontologySrc));
check('1.3 no regulation-number shortcut in expansion block', !/authorityOrientedQuery[\s\S]{0,5000}\b(?:UU|PP)\s*(?:No\.?|Nomor)?\s*\d+/i.test(ontologySrc));
check('1.4 V6.7.9 fair scheduler preserved', /function scheduleQueryPlans\s*\(/.test(ontologySrc));
check('1.5 provider network cap remains 8', /input\.queries\.slice\(0,\s*8\)/.test(retrieverSrc));
check('1.6 V6.7.8 adaptive topical policy preserved', /function profileQueryForTopicalPolicy\s*\(/.test(retrieverSrc));
check('1.7 legacy threshold 14 not restored', !/minScore\s*=\s*minHits\s*>=\s*2\s*\?\s*14\s*:\s*11/.test(retrieverSrc));

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
const agraria = first8.filter(q => /\b(tanah|pertanahan|sertifikat|pendaftaran|peralihan|balik nama)\b/i.test(q));
const authorityAgraria = agraria.filter(q => /pendaftaran\s+tanah|hak\s+atas\s+tanah|peralihan\s+hak|sertifikat/i.test(q));
const noisyLead = agraria.some(q => /^(?:ppjb|ajb|shm|shgb|hgb)\b/i.test(q));
const hasAuthoritySale = first8.some(q => /peralihan\s+hak.*jual\s+beli.*pendaftaran\s+tanah|pendaftaran\s+tanah.*peralihan\s+hak/i.test(q));
const hasRegistration = first8.some(q => /pendaftaran\s+tanah.*(?:peralihan\s+hak|sertifikat)|(?:peralihan\s+hak|sertifikat).*pendaftaran\s+tanah/i.test(q));
const maxTokens = Math.max(...first8.map(q => q.toLowerCase().split(/\s+/).filter(t => t.length >= 3).length));

check('2.1 fixture primary remains contractual civil', context.primary.id === 'PERDATA_KONTRAKTUAL', `primary=${context.primary.id}`);
check('2.2 agraria remains active secondary', context.secondary.some(x => x.id === 'AGRARIA_PERTANAHAN'), `secondary=${context.secondary.map(x => x.id).join(',')}`);
check('2.3 first 8 include agraria queries', agraria.length >= 2, `agraria=${JSON.stringify(agraria)}`);
check('2.4 agraria queries use authority vocabulary', authorityAgraria.length >= 2, `authorityAgraria=${JSON.stringify(authorityAgraria)}`);
check('2.5 shorthand is not the lead authority token', !noisyLead, `agraria=${JSON.stringify(agraria)}`);
check('2.6 sale-chain authority query is provider-oriented', hasAuthoritySale, `first8=${JSON.stringify(first8)}`);
check('2.7 land-registration authority query is provider-oriented', hasRegistration, `first8=${JSON.stringify(first8)}`);
check('2.8 first 8 remain token-bounded', maxTokens <= 6, `maxTokens=${maxTokens}`);
check('2.9 total generated queries remains <=20', queries.length <= 20, `count=${queries.length}`);
check('2.10 no duplicate generated queries', new Set(queries).size === queries.length);

console.log('\nFIRST 8 SCHEDULED QUERIES');
first8.forEach((q, i) => console.log(`${i + 1}. ${q}`));
console.log(`\n${pass}/${pass + fail} authority-query-v6710 checks PASS`);
if (fail) process.exit(1);
