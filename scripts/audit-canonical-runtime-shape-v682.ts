declare const process:any;
import { normalizeCanonicalAuthorities, parseQueryIdentity } from '../server/officialLawRetriever';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail='') { console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; }

const raw = ['PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021','UU No. 5 Tahun 1960','UU No. 8 Tahun 1999'];
const normalized = normalizeCanonicalAuthorities(raw);
check('1 raw canonical labels expand to object seeds', normalized.length===4, `count=${normalized.length}`);
check('2 no normalized seed remains a string', normalized.every(x=>typeof x==='object'));
check('3 every seed is exact-resolver ready', normalized.every(x=>Boolean(x.instrument_family && x.number && x.year)));
check('4 UU 8/1999 parser is exact', (()=>{const id=parseQueryIdentity('UU No. 8 Tahun 1999'); return id.exact && id.instrument_family==='UU' && String(id.number)==='8' && Number(id.year)===1999;})());
check('5 compound PP identities both present', normalized.some(x=>x.instrument_family==='PP'&&x.number==='24'&&x.year===1997) && normalized.some(x=>x.instrument_family==='PP'&&x.number==='18'&&x.year===2021));
console.log(`\n${pass}/${pass+fail} canonical-runtime-shape-v682 checks PASS`);
if(fail) process.exit(1);
