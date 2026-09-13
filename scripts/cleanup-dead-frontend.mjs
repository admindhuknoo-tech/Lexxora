import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = [
  'src/main.tsx',
  'src/App.tsx',
  'src/index.css',
  'src/components/analysis-report.tsx',
  'src/lib/analysis.functions.ts',
  'App.tsx',
  'index.css',
  'components/analysis-report.tsx',
  'lib/analysis.functions.ts',
];
const dirs = ['src/components','src/lib','components','lib'];

for (const rel of targets) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { force: true });
    console.log(`removed ${rel}`);
  }
}
for (const rel of dirs) {
  const p = path.join(root, rel);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0) {
    fs.rmdirSync(p);
    console.log(`removed empty directory ${rel}`);
  }
}
console.log('Selective dead-frontend cleanup complete. Active frontend remains index.html.');
