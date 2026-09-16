declare const process: any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { evaluateOfficialCandidatePolicy } from '../server/officialLawRetriever';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail=''){ console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; }

const dkpp=`--- HALAMAN 1 ---\nJAWABAN ATAS LAPORAN DUGAAN PELANGGARAN KODE ETIK. Pengadu mendalilkan Teradu menjadi Wakil Ketua Lazismu. Teradu menolak seluruh dalil Pengadu.\n--- HALAMAN 2 ---\nBukti T-4 Surat Keputusan pengunduran diri tanggal 16 Januari 2018.\n--- HALAMAN 3 ---\nSK awal tanggal 3 Maret 2021 sempat mencantumkan nama Teradu, namun Surat Revisi tanggal 5 Maret 2021 dan SK tanggal 7 Maret 2021 tidak mencantumkan nama Teradu.\n--- HALAMAN 4 ---\nPengadu mendalilkan kehadiran Teradu pada kegiatan TURBA berdasarkan status WhatsApp. Bukti T-15 adalah surat pernyataan pemilik akun yang membantah transmisi tersebut.`;
const em=buildEvidenceModel(dkpp);
check('DKPP source role defence bundle', em.source_role==='DEFENSE_SUBMISSION_WITH_EXHIBITS', `${em.source_role} ${Math.round(em.source_role_confidence*100)}%`);
check('Facts distinct from claims', em.textual_facts.length>0 && em.party_claims.length>0);
check('Adverse evidence seeded', em.adverse_evidence.length>0, `count=${em.adverse_evidence.length}`);
check('Timeline seeded', em.timeline.length>=2, `count=${em.timeline.length}`);
check('Concrete issue seeds', em.issue_seeds.some(x=>/kepengurusan|pengunduran|status formal/i.test(x.issue)) && em.issue_seeds.some(x=>/bukti elektronik|autentik/i.test(x.issue)), `count=${em.issue_seeds.length}`);


const wanprestasi=`--- HALAMAN 1 ---\nPERJANJIAN JUAL BELI. Penjual berjanji menyerahkan objek setelah pembayaran tahap kedua. Pembeli telah membayar uang muka Rp110.000.000.\n--- HALAMAN 2 ---\nPembeli menyatakan AJB belum dibuat dan telah mengirim somasi agar uang muka dikembalikan. Penjual membantah telah wanprestasi karena syarat pembayaran berikutnya belum terpenuhi.`;
const wm=buildEvidenceModel(wanprestasi);
check('Wanprestasi issue seed is concrete', wm.issue_seeds.some(x=>/prestasi|wanprestasi|somasi/i.test(x.issue)) && wm.issue_seeds.some(x=>/hubungan kontraktual|perjanjian|prestasi timbal/i.test(x.issue)), `count=${wm.issue_seeds.length}`);
check('Wanprestasi claim/fact separation', wm.party_claims.length>0 && wm.textual_facts.length>0);
check('Wanprestasi actor normalization finds both named parties', wm.actors.some(a=>/penjual/i.test(a.actor)) && wm.actors.some(a=>/pembeli/i.test(a.actor)), `actors=${wm.actors.map(a=>a.actor).join(', ')}`);

// Regression fixture for actor/issue coverage outside DKPP + classic wanprestasi wording: a
// consumer/business-entity dispute using generic contract labels and a PT counterparty, which
// previously extracted zero actors and fell back to the single generic catch-all issue seed.
const konsumen=`--- HALAMAN 1 ---\nPERJANJIAN JUAL BELI PERANGKAT ANTARA PIHAK PERTAMA DAN PIHAK KEDUA. Konsumen membeli unit dari PT Sejahtera Abadi Makmur pada tanggal 4 Januari 2024.\n--- HALAMAN 2 ---\nKonsumen mendalilkan barang yang diterima cacat produk dan mengajukan klaim garansi. PT Sejahtera Abadi Makmur membantah dalil tersebut dan menyatakan kerusakan terjadi akibat kesalahan pemakaian.`;
const km=buildEvidenceModel(konsumen);
check('Consumer-dispute actor normalization finds named business entity', km.actors.some(a=>/pt\s+sejahtera/i.test(a.actor)) && km.actors.some(a=>/konsumen/i.test(a.actor)), `actors=${km.actors.map(a=>a.actor).join(', ')}`);
check('Consumer-dispute issue seed is domain-specific, not the generic catch-all', km.issue_seeds.some(x=>/konsumen|cacat produk/i.test(x.issue)), `count=${km.issue_seeds.length}`);

const wrongPerbup='Peraturan Bupati Kabupaten Tanah Laut Nomor 21 Tahun 2020 tentang Pengelolaan Barang Milik Daerah dan Perjanjian Kerja Sama Pemerintah Daerah';
const wrongPerda='Peraturan Daerah Kabupaten Rokan Hulu Nomor 2 Tahun 2019 tentang Ketertiban Umum';
const contractCandidate='Undang-Undang Nomor 8 Tahun 1999 tentang Perlindungan Konsumen. Mengatur perjanjian konsumen, hak dan kewajiban pelaku usaha, ganti rugi, dan penyelesaian sengketa perdata.';
check('Wanprestasi rejects unrelated Perbup', !evaluateOfficialCandidatePolicy('wanprestasi perjanjian perikatan hukum perdata','Hukum Perdata & Perikatan',wrongPerbup,'Peraturan Bupati').accepted);
check('DKPP exact rejects Perda same number/year', !evaluateOfficialCandidatePolicy('Peraturan DKPP Nomor 2 Tahun 2019','Hukum Pemilu & Etik Penyelenggara',wrongPerda,'Peraturan Daerah').accepted);
check('Topical private-law candidate requires material nexus', evaluateOfficialCandidatePolicy('wanprestasi perjanjian ganti rugi','Hukum Perdata & Perikatan',contractCandidate,'Undang-Undang').accepted);

console.log(`\n${pass}/${pass+fail} semantic acceptance checks PASS`);
if(fail) process.exit(1);
