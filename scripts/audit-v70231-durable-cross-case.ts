import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CaseJobStore } from '../server/caseJobStore.ts';
import { __test__ as ocrTest } from '../server/localOcr.ts';

const scenarios = [
  {name:'pleading-12p', pages:12, fail:0},
  {name:'investigation-36p', pages:36, fail:27},
  {name:'appeal-18p', pages:18, fail:6},
  {name:'execution-8p', pages:8, fail:0},
];
let pass=0;
for (const sc of scenarios) {
  const percents:number[]=[];
  const tracker=ocrTest.createOcrProgressTracker(sc.pages,p=>percents.push(Number(p.percent)));
  await ocrTest.runBoundedPageTasks(sc.pages,[{id:1},{id:2}],async(page:number)=>{
    tracker.update(page,25,`${sc.name}:${page}`);
    tracker.update(page,75,`${sc.name}:${page}`);
    tracker.settle(page,page===sc.fail);
  });
  assert.equal(percents.every((v,i)=>i===0||v>=percents[i-1]),true); pass++;
  assert.equal(tracker.snapshot().completed,sc.pages); pass++;
  assert.deepEqual(tracker.snapshot().failed,sc.fail?[sc.fail]:[]); pass++;

  const dir=fs.mkdtempSync(path.join(os.tmpdir(),`lc31-${sc.name}-`));
  const store=new CaseJobStore(dir);
  store.create({token:sc.name,status:'RUNNING',case_id:100+pass,title:sc.name,filename:'case.pdf',input_type:'document',request:{narrative:'',originalname:'case.pdf',mimetype:'application/pdf'},progress:{percent:39,stage:'OCR_PAGE',detail:'running',updated_at:new Date().toISOString(),page:Math.min(sc.pages,5),pages:sc.pages,pages_completed:4,failed_pages:[]},record_snapshot:{id:100+pass,title:sc.name}});
  store.saveSource(sc.name,Buffer.from(sc.name),'case.pdf');
  const reloaded=new CaseJobStore(dir);
  assert.equal(reloaded.get(sc.name)?.status,'RUNNING'); pass++;
  reloaded.markInterruptedRunningJobs();
  assert.equal(new CaseJobStore(dir).get(sc.name)?.status,'FAILED_RECOVERABLE'); pass++;
  fs.rmSync(dir,{recursive:true,force:true});
  console.log('PASS',sc.name);
}
console.log(`SUMMARY ${pass}/20 V7.0.2.31 durable cross-case`);
assert.equal(pass,20);

process.exit(0);
