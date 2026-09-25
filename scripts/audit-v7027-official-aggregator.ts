declare const process:any;
import { __test__, buildAuthorityProviderPlan, inferJudicialAuthorityIdentity } from '../server/officialLawRetriever';
let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){ console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; }

const jdihnHtml=`<html><body><a href="/pencarian/detail/12345">SEMA Nomor 4 Tahun 2016 tentang Rumusan Kamar</a><a href="https://example.com/x">noise</a></body></html>`;
const links=__test__.parseJdihnSearchLinks(jdihnHtml,10);
check('1 JDIHN detail link parsed',links.length===1,JSON.stringify(links));
check('2 JDIHN parser rejects non-official noise',links.every((x:any)=>new URL(x.url).hostname.endsWith('go.id')));
const sema=inferJudicialAuthorityIdentity('Surat Edaran Mahkamah Agung SEMA Nomor 4 Tahun 2016 tentang Rumusan Kamar');
check('3 SEMA judicial identity parsed',sema?.authority_class==='JUDICIAL_PRODUCT' && sema?.year===2016);
const perma=inferJudicialAuthorityIdentity('PERMA Nomor 1 Tahun 2025 tentang Pedoman Mengadili');
check('4 PERMA judicial identity parsed',perma?.authority_class==='JUDICIAL_PRODUCT' && perma?.year===2025);
const putusan=inferJudicialAuthorityIdentity('Putusan Mahkamah Agung Nomor 123 K/Pdt/2024');
check('5 decision identity parsed',putusan?.authority_class==='DECISION');
const plan=buildAuthorityProviderPlan(['wanprestasi perjanjian','pendaftaran tanah','PHK hubungan industrial','keputusan tata usaha negara'],'hybrid');
check('6 provider budget bounded',plan.regulation_queries.length<=6 && plan.judicial_product_queries.length<=2 && plan.case_law_queries.length<=2 && plan.total_query_slots<=10,JSON.stringify(plan));
check('7 no case-specific hardcode in generated judicial slots',!JSON.stringify(plan).toLowerCase().includes('bu sri')&&!JSON.stringify(plan).toLowerCase().includes('subarno'));
const ddg='<a href="https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-4-tahun-2016/detail">SEMA</a>';
check('8 public locator parser still accepts official-domain target',__test__.parseDuckDuckGoDomainHits(ddg,'jdih.mahkamahagung.go.id',3).length===1);
check('9 challenge detection retained',__test__.discoveryBodyState('<html>captcha robot check access denied</html>')==='CHALLENGE_OR_BLOCK');
console.log(`\n${pass}/${pass+fail} V7.0.2.7 official-aggregator checks ${fail?'FAILED':'PASS'}`); if(fail) process.exit(1);
