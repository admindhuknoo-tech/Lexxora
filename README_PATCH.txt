LexiCore V7.0.2.22 — Closure Precision Batch

PURPOSE
One consolidated corrective batch for all remaining material weaknesses identified in the comprehensive audit of the current Case Analysis pipeline. This package is cumulative over the immediately preceding precision work and contains changed files only.

FUNCTIONAL CORRECTIONS
1. Internal authority precision
   - Issue-to-authority binding now applies issue-family compatibility gates.
   - Cross-cutting procedural issues cannot bind to unrelated substantive statutes merely because of domain overlap.
   - PMH internal matching is focused on Pasal 1365 rather than contract-default articles when contract nexus is absent.
   - Issues that require specific article nexus fail closed when no article-level support exists.

2. Issue generation / wording precision
   - Generic remedy/procedure issue no longer appears just because a pleading/gugatan exists.
   - Estate-protection issue requires a real risk/action such as transfer, encumbrance, blocking, seizure, loss or damage.
   - Duplicate generic civil/criminal boundary issue is removed when a more concrete civil-criminal issue already exists.
   - PMH wording no longer presumes that a contract/wanprestasi relationship exists; contract relevance is conditional on factual support.

3. Financial-module activation and content precision
   - Mere amounts, certificates, court costs, ordinary contractual payments, and negative statements do not activate the financial module.
   - Financial activation requires actual credit/loan, collateral/security, repayment, transaction flow, valuation, or account-record context.
   - Follow-up questions are generated only for financial categories actually present in the source.
   - No automatic ledger, appraisal, repayment, personal-gain, or execution questions when the source does not support them.
   - Certificate/data discrepancies are not mislabeled as financial discrepancies unless the context is genuinely financial/collateral.

4. Role / authority / witness precision
   - Counsel, principal and representative are not automatically placed in the authority-duty audit unless their authority/POA is actually disputed.
   - Formal actors such as notary/PPAT/BPN can still be audited where their legal/operational authority is material.
   - Witness/expert planning is emitted only when actual witness targets or an expert-domain need is detected.
   - Generic witness output no longer appears merely because actors were extracted from the document.

5. Workflow precision
   - Civil case theory no longer assumes contract/PMH or wanprestasi without factual basis.
   - Civil pleading workflow no longer uses criminal-stage language such as "pledoi".
   - Approval-chain/SOP, financial reconciliation and witness/expert next actions are conditional on actual source signals.
   - Mandate summary is built from modules that are actually active instead of a fixed generic checklist.

6. Section III explanation precision
   - Applicable-law relevance is enriched from the issues to which each authority is actually bound.
   - Where an issue-specific internal article has been matched, Section III carries that article instead of generic instrument-level relevance.
   - Generic "lolos gate" wording is replaced by issue-linked nexus wording where binding evidence exists.

SOURCE QUALITY
This patch intentionally does NOT force PARTIAL_REVIEW_REQUIRED/OCR limitations to become green. If source quality is genuinely imperfect, the source-quality guard must remain visible and fail closed. That is correct behavior, not a scoring defect.

VALIDATION ACTUALLY EXECUTED IN THIS ENVIRONMENT
A. Full TypeScript check
   node node_modules/typescript/bin/tsc --noEmit
   RESULT: PASS, 0 errors.

B. Deterministic closure regression using production functions
   scripts/audit-v70222-closure-batch.ts
   RESULT: 19/19 PASS.
   Includes issue-generation, authority binding, article precision, Section III enrichment, financial content gating, role/authority gating, witness/drafting gating, and civil workflow wording.

C. Cross-case deterministic regression using production functions
   scripts/audit-v70222-cross-case.ts
   RESULT: 12/12 PASS across:
   - pure contract/default case
   - criminal non-financial case
   - family/inheritance without land
   - real finance/collateral case
   - administrative non-financial case

LIMITS OF THE CLAIM
- These are local deterministic production-function tests plus TypeScript typecheck.
- No live external provider/network claim is made.
- Windows npm run build has NOT been run in this Linux environment.
- Run VERIFY_V70222.bat in the actual Windows project after copying the patch.
- Do not call the Windows runtime validated until the Windows commands and a fresh Case Analysis export succeed there.

FILES TO OVERWRITE
server/caseAnalysis.ts
server/legalOntology.ts
server/lawyerWorkflow.ts
src/data/regulations.json

AUDIT FILES TO ADD
scripts/audit-v70222-closure-batch.ts
scripts/audit-v70222-cross-case.ts
VERIFY_V70222.bat
