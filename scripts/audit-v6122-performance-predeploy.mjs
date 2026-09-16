import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const stat = p => fs.statSync(path.join(root,p)).size;
const index = read('index.html');
const server = read('server.ts');
const appJs = read('public/lexicore.v6122.js');
const pkg = JSON.parse(read('package.json'));
let pass=0, fail=0;
function check(name, ok, detail=''){ console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; }

check('1 index shell below 60 KB', stat('index.html') < 60*1024, `bytes=${stat('index.html')}`);
check('2 CSS externalized', /lexicore\.v6122\.css/.test(index) && fs.existsSync(path.join(root,'public/lexicore.v6122.css')));
check('3 JS externalized and deferred', /lexicore\.v6122\.js" defer/.test(index) && fs.existsSync(path.join(root,'public/lexicore.v6122.js')));
check('4 no top-level inline style block', !/<style>/.test(index));
check('5 no top-level inline script block', !/<script>/.test(index));
check('6 template index excludes heavy official source array', /official_source_count/.test(server) && !/official_source_details:\s*Array\.isArray\(x\?\.official_source_details\)/.test(server));
check('6b template index does not duplicate data payload', !/data: summaries,\s*templates: summaries/.test(server));
check('7 template detail remains on-demand', /\/api\/drafting\/template\/:key/.test(server));
check('8 frontend lazy-loads selected template detail', /loadSelectedDraftTemplateDetail/.test(appJs) && /draftTemplateDetailCache/.test(appJs));
check('9 template index uses ETag', /If-None-Match|if-none-match/.test(server) && /setHeader\('ETag'/.test(server));
check('10 initial workspace load deferred to idle', /requestIdleCallback/.test(appJs));
check('11 build precompress script wired', String(pkg.scripts?.build||'').includes('precompress-static-v6122.mjs'));
check('12 Brotli/Gzip serving wired', /Content-Encoding/.test(server) && /\.br/.test(server) && /\.gz/.test(server));
check('13 versioned assets immutable cached', /max-age=31536000, immutable/.test(server) && /\\\.v\\d\+/.test(server));
check('14 API no-store remains default', /app\.use\('\/api'.*Cache-Control.*no-store/s.test(server));
check('15 semantic pipeline source untouched by perf patch', fs.existsSync(path.join(root,'server/caseAnalysis.ts')) && fs.existsSync(path.join(root,'server/documentIngestion.ts')));

console.log(`\n${pass}/${pass+fail} performance-predeploy-v6122 checks PASS`);
if(fail) process.exit(1);
