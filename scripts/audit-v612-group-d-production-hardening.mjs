import fs from 'node:fs';
import path from 'node:path';

let pass=0, fail=0;
const check=(name,ok,detail='')=>{ console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; };
const root=process.cwd();
const server=fs.readFileSync(path.join(root,'server.ts'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
const compose=fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8');
const smoke=fs.readFileSync(path.join(root,'scripts','smoke-production.mjs'),'utf8');

check('1 security headers installed', /Content-Security-Policy/.test(server) && /X-Content-Type-Options/.test(server) && /X-Frame-Options/.test(server));
check('2 HSTS production-aware', /Strict-Transport-Security/.test(server) && /NODE_ENV === 'production'/.test(server));
check('3 expensive endpoints rate-limited', /case-analysis', expensiveAnalysisLimit/.test(server) && /review', expensiveAnalysisLimit/.test(server));
check('4 upload size and type guard', /MAX_UPLOAD_MB/.test(server) && /allowedUploadExtensions/.test(server) && /fileFilter/.test(server));
check('5 structured request logging', /event: 'http_request'/.test(server) && /X-Request-Id/.test(server));
check('6 API errors do not leak internals', /Terjadi kesalahan internal pada API LexiCore/.test(server) && /event:'api_error'/.test(server));
check('7 liveness endpoint exists', /app\.get\('\/api\/live'/.test(server));
check('8 readiness endpoint exists', /app\.get\('\/api\/ready'/.test(server) && /storage_mode: 'IN_MEMORY_TRANSIENT'/.test(server));
check('9 health exposes operational baseline', /V6\.12\.(?:0-GROUP-D|2-PERFORMANCE-PREDEPLOY)/.test(server) && /uptime_seconds/.test(server));
check('10 graceful shutdown exists', /SIGTERM/.test(server) && /server\.close/.test(server));
check('11 template index is lightweight', /const summaries = Object\.fromEntries/.test(server) && !/structure: x\?\.structure/.test(server));
check('12 template detail endpoint retained', /\/api\/drafting\/template\/:key/.test(server));
check('13 reference template response cache configured', /private, max-age=300, must-revalidate/.test(server));
check('14 production static cache configured', /max-age=31536000, immutable/.test(server) && /index\.html'\) res\.setHeader\('Cache-Control', 'no-cache'\)/.test(server));
check('15 Docker multi-stage build exists', /AS build/.test(docker) && /npm run build/.test(docker) && /USER node/.test(docker));
check('16 Docker healthcheck targets readiness', /api\/ready/.test(docker));
check('17 compose binds localhost by default', /127\.0\.0\.1:\$\{LEXICORE_PORT:-3000\}:3000/.test(compose));
check('18 compose read-only hardening', /read_only: true/.test(compose) && /tmpfs:/.test(compose));
check('19 production smoke script covers live ready health', /\/api\/live/.test(smoke) && /\/api\/ready/.test(smoke) && /\/api\/health/.test(smoke));
check('20 package scripts expose group-d and smoke', !!pkg.scripts?.['audit:group-d'] && !!pkg.scripts?.['smoke:production']);

console.log(`\n${pass}/${pass+fail} group-d-v612 checks PASS`);
if(fail) process.exit(1);
