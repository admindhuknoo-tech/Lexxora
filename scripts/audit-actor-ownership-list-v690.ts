declare const process: any;
import { buildEvidenceModel } from '../server/evidenceModel';

let pass=0, fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

// Regression fixture from Test Case 16. The extractor must recognize the
// explicit SHM ownership list, but must not promote the location or BPN/ATR
// phrase into human actors.
const fixture=`Ada SHM nomor 10 seluas 10.000m2 atas nama 3 orang, Agus, Budi dan Bambang lokasinya di Surabaya. Tanah ini terpotong Tol 3000m2, sertipikat sisanya di proses Kantor BPN/ATR Kota Surabaya.`;
const em=buildEvidenceModel(fixture);
const names=em.actors.map(a=>String(a.actor));
const lower=names.map(n=>n.toLowerCase());

for(const name of ['Agus','Budi','Bambang']){
  check(`${name} extracted from explicit ownership list`,lower.includes(name.toLowerCase()),`actors=${names.join(', ')}`);
}

check('Surabaya not promoted to actor',!lower.some(n=>n==='surabaya'),`actors=${names.join(', ')}`);
check('BPN/ATR location phrase not promoted to actor',!lower.some(n=>/bpn|atr|kantor/.test(n)),`actors=${names.join(', ')}`);

const owners=em.actors.filter(a=>['agus','budi','bambang'].includes(String(a.actor).toLowerCase()));
check('ownership actors retain sentence-scoped provenance',owners.every(a=>(a.evidence_quotes||[]).some(q=>/atas nama 3 orang/i.test(q))),owners.map(a=>`${a.actor}:${a.evidence_quotes?.[0]||''}`).join(' || '));

console.log(`\n${pass}/${pass+fail} actor-ownership-list-v690 checks PASS`);
if(fail)process.exit(1);
