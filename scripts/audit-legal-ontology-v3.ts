import { inferLegalContext, deriveOntologyIssues } from '../server/legalOntology';
import { buildOfficialLawQueries, evaluateOfficialCandidatePolicy, inferTempusYearFromCase } from '../server/officialLawRetriever';

const checks: Array<[string, boolean, string]> = [];
const add=(name:string,ok:boolean,detail:string)=>checks.push([name,ok,detail]);

const waris=`Seorang duda mempunyai satu anak kandung. Sawah bersertifikat telah dimiliki sebelum menikah lagi. Setelah ayah meninggal, istri kedua ingin menguasai sawah dan merobek sertifikat. Ditanyakan legitime portie, bagian ahli waris, harta bawaan dan langkah hukum.`;
const wctx=inferLegalContext(waris);
add('waris routes to family/inheritance',wctx.primary.id==='KELUARGA_WARIS',`${wctx.primary.id} score=${wctx.primary.score} confidence=${wctx.confidence}`);
const wissues=deriveOntologyIssues(waris).map(x=>x.id);
add('waris produces multi-issue graph',['inheritance-entitlement','marital-property-estate','estate-asset-protection','civil-criminal-response'].every(x=>wissues.includes(x)),wissues.join(','));

const wan=`Debitur tidak melunasi kewajiban setelah jatuh tempo meskipun telah disomasi dua kali. Kreditur menuntut wanprestasi dan ganti rugi berdasarkan perjanjian.`;
const vctx=inferLegalContext(wan);
add('wanprestasi routes contractual',vctx.primary.id==='PERDATA_KONTRAKTUAL',`${vctx.primary.id} score=${vctx.primary.score}`);

const land=`Sengketa batas tanah SHM, surat ukur berbeda dan terdapat permohonan pengukuran ulang pada Kantor Pertanahan.`;
const lctx=inferLegalContext(land);
add('pure land dispute routes agrarian',lctx.primary.id==='AGRARIA_PERTANAHAN',`${lctx.primary.id} score=${lctx.primary.score}`);

const exactBad=evaluateOfficialCandidatePolicy('Undang-Undang Nomor 1 Tahun 2015','Hukum Pemilu','Peraturan Pemerintah Pengganti Undang-Undang Nomor 1 Tahun 2015 Tentang Perubahan Atas UU KPK');
add('UU exact rejects PERPPU same number/year',!exactBad.accepted,JSON.stringify(exactBad));
const exactGood=evaluateOfficialCandidatePolicy('Undang-Undang Nomor 7 Tahun 2017','Hukum Pemilu','Undang-Undang Nomor 7 Tahun 2017 tentang Pemilihan Umum');
add('UU exact accepts exact UU',exactGood.accepted,JSON.stringify(exactGood));
const perbup=evaluateOfficialCandidatePolicy('wanprestasi perjanjian perikatan hukum perdata','Hukum Perdata & Perikatan','Peraturan Bupati Tanah Laut Nomor 12 Tahun 2022 tentang Pengelolaan Barang Milik Daerah dan perjanjian kerja sama','Peraturan Bupati');
add('private-law topical rejects unrelated Perbup',!perbup.accepted,JSON.stringify(perbup));

const queries=buildOfficialLawQueries({title:'Analisis Kasus',domain:'Hukum Keluarga & Waris',text:waris});
add('waris queries are issue-driven',queries.some(q=>/waris|ahli waris|legitime|boedel/i.test(q)) && !queries.some(q=>/^agraria pertanahan pendaftaran tanah$/i.test(q)),queries.join(' | '));
const unknownQueries=buildOfficialLawQueries({title:'Analisis Kasus',domain:'Hukum Perlindungan Konsumen',text:'Konsumen membeli produk elektronik cacat. Pelaku usaha menolak garansi dan penggantian kerugian.'});
add('open-world lexical fallback exists',unknownQueries.length>0,unknownQueries.join(' | '));

const tempus=inferTempusYearFromCase('Undang-Undang Nomor 7 Tahun 2017 dan Peraturan Tahun 2019. Peristiwa yang disengketakan terjadi pada 12 Mei 2021 dan surat dikirim tahun 2021.');
add('tempus favors event year over citation frequency',tempus===2021,String(tempus));

const failed=checks.filter(x=>!x[1]);
for(const [name,ok,detail] of checks) console.log(`${ok?'PASS':'FAIL'} | ${name} | ${detail}`);
console.log(`\n${checks.length-failed.length}/${checks.length} ontology-v3 checks PASS`);
if(failed.length) process.exit(1);
