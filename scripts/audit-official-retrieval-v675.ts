declare const process:any;
import fs from 'fs';

const p=process.argv[2];
if(!p){
  console.error('Usage: npx tsx scripts/audit-official-retrieval-v675.ts <case-analysis.json>');
  process.exit(2);
}
const raw=JSON.parse(fs.readFileSync(p,'utf8'));

function findDiagnostics(obj:any):any {
  if(!obj || typeof obj!=='object') return null;
  if(obj.official_law_retrieval?.diagnostics) return obj.official_law_retrieval.diagnostics;
  if(obj.diagnostics?.queries_attempted!==undefined && obj.diagnostics?.provider_status) return obj.diagnostics;
  for(const v of Object.values(obj)){
    const found=findDiagnostics(v);
    if(found) return found;
  }
  return null;
}

const d=findDiagnostics(raw);
if(!d){
  console.error('official_law_retrieval.diagnostics not found in JSON');
  process.exit(1);
}

const summary={
  provider_status:d.provider_status ?? null,
  queries_attempted:Number(d.queries_attempted ?? 0),
  queries_reachable:Number(d.queries_reachable ?? 0),
  total_links_found:Number(d.total_links_found ?? 0),
  total_candidates_pushed:Number(d.total_candidates_pushed ?? 0),
  total_rejected_identity:Number(d.total_rejected_identity ?? 0),
  total_rejected_topical:Number(d.total_rejected_topical ?? 0),
  total_rejected_missing_identity:Number(d.total_rejected_missing_identity ?? 0),
  total_detail_fetch_failed:Number(d.total_detail_fetch_failed ?? 0),
};

console.log(JSON.stringify(summary,null,2));

const pq=Array.isArray(d.per_query)?d.per_query:[];
for(const q of pq){
  console.log(JSON.stringify({
    query:q.query,
    fetch_ok:q.fetch_ok,
    http_status:q.http_status,
    html_length:q.html_length,
    links_found:q.links_found,
    has_details_href:q.has_details_href,
  }));
}

const rej=Array.isArray(d.candidate_rejections)?d.candidate_rejections:[];
if(rej.length){
  console.log('REJECTIONS');
  for(const r of rej.slice(0,50)) console.log(JSON.stringify(r));
}

let diagnosis='UNCLASSIFIED';
if(summary.queries_reachable===0) diagnosis='PROVIDER_UNREACHABLE';
else if(summary.total_links_found===0) diagnosis='PARSER_OR_SEARCH_NO_LINKS';
else if(summary.total_candidates_pushed===0 && (
  summary.total_rejected_identity>0 ||
  summary.total_rejected_topical>0 ||
  summary.total_rejected_missing_identity>0
)) diagnosis='LINKS_FOUND_BUT_ALL_REJECTED';
else if(summary.total_detail_fetch_failed>0 && summary.total_candidates_pushed===0) diagnosis='DETAIL_FETCH_FAILURE';
else if(summary.total_candidates_pushed>0) diagnosis='CANDIDATES_AVAILABLE';

console.log(`DIAGNOSIS=${diagnosis}`);
