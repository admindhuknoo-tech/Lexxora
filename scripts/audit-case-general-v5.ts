import { inferLegalContext, deriveOntologyIssues } from '../server/legalOntology';
import { buildEvidenceModel } from '../server/evidenceModel';
import { buildOfficialLawQueries, evaluateOfficialCandidatePolicy, inferTempusYearFromCase } from '../server/officialLawRetriever';
import { reasonForensically } from '../server/forensicReasoner';

let pass=0, total=0;
function check(name:string, ok:boolean, detail=''){ total++; if(ok) pass++; console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`); }
function inspect(text:string){
  const context=inferLegalContext(text);
  const evidence=buildEvidenceModel(text);
  const issues=deriveOntologyIssues(text);
  return {context,evidence,issues};
}

const waris=inspect('Seorang ayah memiliki sawah bersertifikat atas namanya. Ia menikah lagi dan tinggal dengan istri kedua selama 15 tahun. Ayah meninggal tahun 2025 dan meninggalkan seorang anak kandung. Ibu tiri menguasai sawah dan merobek sertifikat. Pertanyaannya bagaimana hak ahli waris dan langkah hukum yang dapat ditempuh?');
check('waris primary',waris.context.primary.id==='KELUARGA_WARIS',waris.context.primary.id);
check('waris narrative role',waris.evidence.source_role==='CASE_NARRATIVE_OR_QUESTION',waris.evidence.source_role);
check('waris narrative not factualized',waris.evidence.party_claims.length>0 && waris.evidence.textual_facts.length===0,`claims=${waris.evidence.party_claims.length},facts=${waris.evidence.textual_facts.length}`);
check('waris multi issue',waris.issues.length>=3,waris.issues.map(x=>x.id).join(','));

const saleText='Perihal: Jual beli tanah. Para pihak: 1. Agnes 2. Irma (Klien) 3. Imam 4. Hendra. Duduk Perkara: Sekira tahun 2023 terjadi kesepakatan jual beli. Agnes menjual tanah 150 m2 kepada Irma dengan pembayaran bertahap DP 110 juta dan tahap berikut setelah AJB keluar. AJB tidak kunjung dibuat. Para pihak kemudian sepakat pembatalan dan Irma meminta pengembalian DP. Belakangan Agnes bermaksud menjual objek yang sama kepada Hendra. Irma meminta langkah hukum.';
const sale=inspect(saleText);
check('sale contractual primary',sale.context.primary.id==='PERDATA_KONTRAKTUAL',sale.context.primary.id);
check('sale agraria secondary',sale.context.secondary.some(x=>x.id==='AGRARIA_PERTANAHAN'),sale.context.secondary.map(x=>x.id).join(','));
for(const n of ['Agnes','Irma','Imam','Hendra']) check(`actor ${n}`,sale.evidence.actors.some(a=>a.actor===n),sale.evidence.actors.map(a=>a.actor).join(','));
check('sale tempus 2023',inferTempusYearFromCase(saleText)===2023,String(inferTempusYearFromCase(saleText)));
check('sale cancellation issue',sale.issues.some(x=>x.id==='cancellation-restitution'),sale.issues.map(x=>x.id).join(','));
check('sale third-party issue',sale.issues.some(x=>x.id==='competing-disposition'),sale.issues.map(x=>x.id).join(','));
check('sale land chain issue',sale.issues.some(x=>x.id==='land-sale-chain'),sale.issues.map(x=>x.id).join(','));

const ref=inspect('PUTUSAN Nomor 10/Pdt/2025/PN X. Majelis mengadili perkara dan memuat pertimbangan hukum serta amar putusan. Dokumen ini dilampirkan sebagai referensi untuk analisis perkara klien.');
check('decision treated as reference material',ref.evidence.source_role==='LEGAL_REFERENCE_MATERIAL',ref.evidence.source_role);
check('no adjudicative analysis role',ref.evidence.source_role!=='ADJUDICATIVE_DECISION',ref.evidence.source_role);

const dkpp=inspect('JAWABAN ATAS LAPORAN DUGAAN PELANGGARAN KODE ETIK. Teradu membantah dalil Pengadu. Bukti T-1 berupa surat tertanggal 5 Januari 2021. Pengadu menyatakan Teradu masih menjadi pengurus. Screenshot WhatsApp diajukan sebagai bukti elektronik.');
check('dkpp defense role',dkpp.evidence.source_role==='DEFENSE_SUBMISSION_WITH_EXHIBITS',dkpp.evidence.source_role);
check('dkpp election domain',dkpp.context.primary.id==='PEMILU_ETIK_DKPP',dkpp.context.primary.id);
check('dkpp electronic issue single',dkpp.issues.filter(x=>x.id==='electronic-evidence').length===1,String(dkpp.issues.filter(x=>x.id==='electronic-evidence').length));

const bap=inspect('BERITA ACARA PEMERIKSAAN. Penyidik memeriksa tersangka pada 12 Januari 2026 mengenai dugaan penggelapan. Barang bukti disita pada tanggal tersebut.');
check('BAP role',bap.evidence.source_role==='INVESTIGATION_OR_BAP',bap.evidence.source_role);
check('criminal domain',bap.context.primary.id==='PIDANA_MATERIIL_FORMIL',bap.context.primary.id);

// Regression V5.4.1: a weak letter-format marker must not erase a material case narrative.
const mixedHeaderText='Perihal: Penggelapan kendaraan. Bagus ditangkap dan ditahan polisi atas laporan pemilik kendaraan. Bagus menyewa kendaraan milik Rahmad setiap bulan. Kendaraan kemudian digadaikan kepada pihak lain, berpindah penguasaan, dan selanjutnya disewa sebuah perusahaan. Pemilik melaporkan kejadian tersebut kepada polisi.';
const mixedHeader=inspect(mixedHeaderText);
check('weak Perihal header remains case narrative',mixedHeader.evidence.source_role==='CASE_NARRATIVE_OR_QUESTION',mixedHeader.evidence.source_role);
check('weak-header narrative keeps party claims',mixedHeader.evidence.party_claims.length>=3,`claims=${mixedHeader.evidence.party_claims.length}`);
check('weak-header narrative keeps criminal secondary',mixedHeader.context.secondary.some(x=>x.id==='PIDANA_MATERIIL_FORMIL')||mixedHeader.context.primary.id==='PIDANA_MATERIIL_FORMIL',[mixedHeader.context.primary.id,...mixedHeader.context.secondary.map(x=>x.id)].join(','));
check('weak-header narrative keeps asset disposition issue',mixedHeader.issues.some(x=>x.id==='asset-disposition-authority'),mixedHeader.issues.map(x=>x.id).join(','));

// True correspondence remains correspondence, but its body is claim-first rather than discarded.
const somasi=inspect('SOMASI. Kepada Yth. Pihak penyewa. Klien menyatakan kendaraan miliknya telah dialihkan tanpa izin dan meminta pengembalian kendaraan. Surat Nomor 12/SOM/2026 tertanggal 2 September 2026.');
check('true somasi remains legal correspondence',somasi.evidence.source_role==='LEGAL_CORRESPONDENCE',somasi.evidence.source_role);
check('legal correspondence body retained as claims',somasi.evidence.party_claims.length>0,`claims=${somasi.evidence.party_claims.length},facts=${somasi.evidence.textual_facts.length},missing=${somasi.evidence.missing_facts.length}`);

const consumerText='Konsumen membeli perangkat elektronik yang kemudian tidak berfungsi. Pelaku usaha menolak permintaan penggantian dan pengembalian pembayaran. Konsumen meminta analisis hak dan langkah hukum.';
const consumer=inspect(consumerText);
check('consumer gets issue graph',consumer.issues.length>0,consumer.issues.map(x=>x.id).join(','));
const consumerQueries=buildOfficialLawQueries({title:'Analisis perkara',domain:consumer.context.primary.label,text:consumerText,issues:consumer.issues});
check('consumer gets queries',consumerQueries.length>0,consumerQueries.join(' | '));

const bad=evaluateOfficialCandidatePolicy('Undang-Undang Nomor 1 Tahun 2015','Hukum Indonesia','Peraturan Pemerintah Pengganti Undang-Undang Nomor 1 Tahun 2015 Tentang Perubahan Atas Undang-Undang Nomor 30 Tahun 2002','Peraturan Pemerintah Pengganti Undang-Undang');
check('UU exact rejects PERPPU collision',!bad.accepted,JSON.stringify(bad));
const good=evaluateOfficialCandidatePolicy('Undang-Undang Nomor 1 Tahun 2015','Hukum Indonesia','Undang-Undang Nomor 1 Tahun 2015 tentang Penetapan Peraturan Pemerintah Pengganti Undang-Undang Nomor 1 Tahun 2014','Undang-Undang');
check('UU exact accepts same family/number/year',good.accepted,JSON.stringify(good));

const reasoned=reasonForensically({title:'Waris',primaryDomain:waris.context.primary.label,domainContext:waris.context,evidence:waris.evidence,lawCandidates:[],tempusYear:2025});
const actorText=reasoned.actor_matrix.map(x=>x.explicit_rights_obligations).join(' | ');
check('reasoner does not invent actor rights/obligations',!/wajib membayar|berhak menerima bagian|presumption of innocence|fiduciary duty/i.test(actorText),actorText.slice(0,500));

console.log(`\n${pass}/${total} semantic checks PASS`);
if(pass!==total) process.exit(1);
