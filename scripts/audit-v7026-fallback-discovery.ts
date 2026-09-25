declare const process:any;
import { __test__ } from '../server/officialLawRetriever';
let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){ console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; }
const domain='jdih.mahkamahagung.go.id';
const ddgClassic='<a class="result__a" href="https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-4-tahun-2016/detail"><span>SEMA Nomor 4 Tahun 2016</span></a>';
const ddgLite='<table><tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fjdih.mahkamahagung.go.id%2Flegal-product%2Fperma-nomor-1-tahun-2025%2Fdetail">PERMA Nomor 1 Tahun 2025</a></td></tr></table>';
const ddgChanged='<div><a href="https://jdih.mahkamahagung.go.id/dokumen/123">Produk Hukum MA</a></div>';
const bing='<li class="b_algo"><h2><a href="https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2025/detail">SEMA Nomor 1 Tahun 2025</a></h2></li>';
check('1 DDG classic markup parsed',__test__.parseDuckDuckGoDomainHits(ddgClassic,domain,5).length===1);
check('2 DDG lite redirect markup parsed',__test__.parseDuckDuckGoDomainHits(ddgLite,domain,5).length===1);
check('3 DDG changed generic anchor parsed',__test__.parseDuckDuckGoDomainHits(ddgChanged,domain,5).length===1);
check('4 Bing standard markup parsed',__test__.parseBingDomainHits(bing,domain,5).length===1);
check('5 foreign domain rejected',__test__.parseDuckDuckGoDomainHits('<a href="https://example.com/x">x</a>',domain,5).length===0);
check('6 empty body classified',__test__.discoveryBodyState('')==='EMPTY');
check('7 challenge body classified',__test__.discoveryBodyState('<html>captcha robot check access denied</html>')==='CHALLENGE_OR_BLOCK');
check('8 short response classified',__test__.discoveryBodyState('<html>ok</html>')==='SHORT_RESPONSE');
check('9 substantive HTML classified',__test__.discoveryBodyState('<html>'+('result '.repeat(200))+'</html>')==='HTML');
console.log(`\n${pass}/${pass+fail} V7.0.2.6 fallback discovery parser checks PASS`); if(fail) process.exit(1);
