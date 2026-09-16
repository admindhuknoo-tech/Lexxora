import { buildEvidenceModel } from '../server/evidenceModel';
function ck(name:string, ok:boolean, detail=''){ if(!ok) throw new Error(`FAIL: ${name} ${detail}`); console.log(`PASS | ${name}`); }
const text=`Halaman 1\nUndang-Undang atau Pasal-Pasal yang bersangkutan. Oleh Undang ditentukan unsur pidana. Dari Pasal yang dilanggar. Kredit dicairkan kepada Sdri. DEWI MUFARIDA. Dewi Mufarida menerima dokumen.`;
const em=buildEvidenceModel(text);
const names=em.actors.map(a=>a.actor);
ck('generic token Undang is not actor',!names.some(x=>/^Undang$/i.test(x)),names.join('|'));
ck('generic token Pasal is not actor',!names.some(x=>/^Pasal$/i.test(x)),names.join('|'));
ck('honorific Sdri is not actor',!names.some(x=>/^Sdri$/i.test(x)),names.join('|'));
ck('real named person remains extractable',names.some(x=>/Dewi Mufarida/i.test(x)),names.join('|'));
