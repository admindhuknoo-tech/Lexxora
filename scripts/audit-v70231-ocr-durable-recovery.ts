import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { __test__ as ocrTest } from '../server/localOcr.ts';
import { CaseJobStore } from '../server/caseJobStore.ts';
import { extractUploadedDocument } from '../server/documentIngestion.ts';

let pass = 0;
function ok(name:string, fn:()=>void) {
  try { fn(); console.log('PASS', name); pass++; }
  catch (e) { console.error('FAIL', name, e); throw e; }
}

async function aok(name:string, fn:()=>Promise<void>) {
  try { await fn(); console.log('PASS', name); pass++; }
  catch (e) { console.error('FAIL', name, e); throw e; }
}

async function main() {
await aok('production image OCR audit exercises extractUploadedDocument lane', async () => {
  const fixture = fs.readFileSync(path.join(process.cwd(), 'scripts', 'fixtures', 'bap-production-lane.png'));
  const result = await extractUploadedDocument(fixture, 'bap-production-lane.png', 'image/png');
  assert.equal(result.mode, 'LOCAL_OCR');
  assert.equal(result.pages_total, 1);
  assert.ok(result.text.length > 40);
  const normalized = result.text.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  assert.ok(normalized.includes('BERITA') && normalized.includes('PEMERIKSAAN'), `unexpected OCR text: ${result.text.slice(0,160)}`);
});

const seen:number[] = [];
const tracker = ocrTest.createOcrProgressTracker(36, p => seen.push(Number(p.percent)));
tracker.update(4, 80, 'page4');
tracker.update(1, 20, 'page1');
tracker.update(12, 95, 'page12');
tracker.settle(4, false);
tracker.update(2, 60, 'page2');
tracker.settle(1, false);
tracker.settle(27, true);
for (let i=1;i<=36;i++) if (![1,4,27].includes(i)) tracker.settle(i, false);
const snap = tracker.snapshot();
ok('parallel progress is monotonic even when page events arrive out of order', () => {
  assert.equal(seen.every((v,i)=>i===0 || v>=seen[i-1]), true);
});
ok('progress tracker counts every settled page', () => assert.equal(snap.completed, 36));
ok('progress tracker preserves failed page identity', () => assert.deepEqual(snap.failed, [27]));

await aok('bounded pool continues after one timed-out page and reaches page 36', async () => {
  const visited:number[] = [];
  const failed:number[] = [];
  await ocrTest.runBoundedPageTasks(36, [{id:1},{id:2}], async (page:number) => {
    visited.push(page);
    if (page === 27) {
      const keepAlive=setInterval(()=>{},50);
      try { await ocrTest.withTimeout(new Promise<void>(()=>{}), 20, 'synthetic page 27'); }
      catch { failed.push(page); } finally { clearInterval(keepAlive); }
    }
  });
  assert.deepEqual([...visited].sort((a,b)=>a-b), Array.from({length:36},(_,i)=>i+1));
  assert.deepEqual(failed, [27]);
});

const serverSource=fs.readFileSync(path.join(process.cwd(),'server.ts'),'utf8');
ok('final progress stage is aligned to frontend COMPLETED contract', () => assert.match(serverSource, /stage:'COMPLETED'/));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicore-v31-job-'));
const storeA = new CaseJobStore(tmp);
const initialProgress = { percent:28, stage:'OCR_PAGE', detail:'page 26', updated_at:new Date().toISOString(), page:26, pages:36, pages_completed:25, failed_pages:[] as number[] };
storeA.create({ token:'job-36', status:'RUNNING', case_id:777, title:'BAP 36 halaman', filename:'bap.pdf', input_type:'document', request:{narrative:'',originalname:'bap.pdf',mimetype:'application/pdf'}, progress:initialProgress, record_snapshot:{id:777,title:'BAP 36 halaman'} });
storeA.saveSource('job-36', Buffer.from('pdf-bytes'), 'bap.pdf');
const storeB = new CaseJobStore(tmp);
ok('durable store survives a new store instance', () => assert.equal(storeB.get('job-36')?.case_id, 777));
ok('durable store preserves page checkpoint', () => assert.equal(storeB.get('job-36')?.progress.page, 26));
ok('durable store preserves source bytes for resume', () => assert.equal(storeB.readSource('job-36')?.toString(), 'pdf-bytes'));
storeB.updateProgress('job-36', { page:27, pages_completed:26, failed_pages:[27], detail:'page 27 failed' });
ok('durable progress update preserves failed-page checkpoint', () => assert.deepEqual(new CaseJobStore(tmp).get('job-36')?.progress.failed_pages, [27]));
const interrupted = storeB.markInterruptedRunningJobs();
ok('runtime restart converts RUNNING to FAILED_RECOVERABLE', () => assert.equal(interrupted[0]?.status, 'FAILED_RECOVERABLE'));
ok('interrupted job remains recoverable after reload', () => assert.equal(new CaseJobStore(tmp).get('job-36')?.status, 'FAILED_RECOVERABLE'));
storeB.update('job-36', { status:'COMPLETED', record_snapshot:{id:777,title:'done'} });
storeB.deleteSource('job-36');
ok('completed job metadata remains after sensitive source cleanup', () => assert.equal(new CaseJobStore(tmp).get('job-36')?.status, 'COMPLETED'));
ok('source binary is deleted only after completion cleanup', () => assert.equal(storeB.readSource('job-36'), null));

fs.rmSync(tmp, {recursive:true,force:true});
console.log(`SUMMARY ${pass}/14 V7.0.2.31 OCR + durable recovery`);
assert.equal(pass, 14);

}

main().catch((err) => { console.error(err); process.exit(1); });
