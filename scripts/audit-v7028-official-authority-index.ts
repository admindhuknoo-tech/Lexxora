import { OFFICIAL_AUTHORITY_INDEX, officialAuthorityIndexStats, searchOfficialAuthorityIndex } from '../server/officialAuthorityIndex.ts';

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){ if(ok){pass++;console.log(`PASS | ${name}${detail?` | ${detail}`:''}`)} else {fail++;console.error(`FAIL | ${name}${detail?` | ${detail}`:''}`)} }

const stats=officialAuthorityIndexStats();
check('index has diversified catalog',stats.total>=20,JSON.stringify(stats));
check('index includes judicial products',stats.judicial_products>=15,String(stats.judicial_products));
check('index includes decisions',stats.decisions>=3,String(stats.decisions));
check('no case-party hardcode',!JSON.stringify(OFFICIAL_AUTHORITY_INDEX).match(/Bu Sri|Subarno|Suwardi|Suwita/i));

const land=searchOfficialAuthorityIndex({queries:['peralihan hak jual beli tanah sertifikat SEMA'],domain:'Hukum Agraria & Pertanahan',caseText:'pembeli telah melakukan pengecekan sertifikat dan balik nama',limit:5,authorityClass:'JUDICIAL_PRODUCT'});
check('land doctrine finds indexed judicial authority',land.some(x=>x.entry.id==='sema-4-2016'),land.map(x=>`${x.entry.id}:${x.score}`).join(','));

const criminal=searchOfficialAuthorityIndex({queries:['praperadilan penetapan tersangka bukti permulaan putusan Mahkamah Konstitusi'],domain:'Hukum Pidana',limit:5,authorityClass:'DECISION'});
check('criminal case-law index works',criminal.some(x=>x.entry.id==='mk-21-puu-xii-2014'),criminal.map(x=>`${x.entry.id}:${x.score}`).join(','));

const consumer=searchOfficialAuthorityIndex({queries:['pelindungan konsumen gugatan OJK PERMA'],domain:'Hukum Perlindungan Konsumen',limit:4,authorityClass:'JUDICIAL_PRODUCT'});
check('consumer domain index works',consumer.some(x=>x.entry.id==='perma-4-2025'),consumer.map(x=>`${x.entry.id}:${x.score}`).join(','));

const bank=searchOfficialAuthorityIndex({queries:['sengketa bank likuidasi pengadilan niaga PERMA'],domain:'Hukum Perbankan dan Kepailitan',limit:4,authorityClass:'JUDICIAL_PRODUCT'});
check('bank/insolvency domain index works',bank.some(x=>x.entry.id==='perma-1-2026'),bank.map(x=>`${x.entry.id}:${x.score}`).join(','));

const tax=searchOfficialAuthorityIndex({queries:['pidana perpajakan pemidanaan PERMA'],domain:'Hukum Pidana Perpajakan',limit:4,authorityClass:'JUDICIAL_PRODUCT'});
check('tax domain index works',tax.some(x=>x.entry.id==='perma-3-2025'),tax.map(x=>`${x.entry.id}:${x.score}`).join(','));

const irrelevant=searchOfficialAuthorityIndex({queries:['lisensi perangkat lunak sumber terbuka'],domain:'Teknologi',limit:5,authorityClass:'JUDICIAL_PRODUCT'});
check('irrelevant query stays fail-closed',irrelevant.length===0,irrelevant.map(x=>x.entry.id).join(','));

console.log(`\n${pass}/${pass+fail} V7.0.2.8 official authority index checks PASS`);
process.exitCode=fail?1:0;
