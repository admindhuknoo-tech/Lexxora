# LexiCore Frontend Source of Truth — Selective Cleanup

## Decision
The active frontend source of truth is `index.html`.

## Removed as orphan/parallel frontend
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/components/analysis-report.tsx`
- `src/lib/analysis.functions.ts`
- root `App.tsx`
- root `index.css`
- root `components/analysis-report.tsx`
- root `lib/analysis.functions.ts`

These files were removed only after dependency inspection confirmed that `index.html` does not import or mount them and they only reference one another.

## Preserved
- `index.html` and all eight active modules
- `src/data/*`
- all server routes, Case Analysis, Draft Builder, exporters, source registry and audit scripts
- existing API contracts

## Vite
React/Tailwind plugins were removed from Vite configuration because the active frontend is an inline HTML/CSS/JS application. Frontend-only unused packages were removed from package metadata/lockfile.

## One-time patch application
For an existing project, after extracting the patch run:

```bat
npm run cleanup:dead-frontend
npm install
npm run audit:deep
npm run lint
npm run build
```

The cleanup script deletes only the explicit orphan file allow-list above.
