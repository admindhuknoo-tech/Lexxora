// Regression test for actorStatus()'s statementAssertsActorStatus() in
// forensicReasoner.ts: a status/role keyword and a name sharing one
// unpunctuated clause must not be credited to each other when an
// object-marking preposition ("kepada"/"oleh") sits between them - those
// words mark the following name as a recipient or a different acting
// party, not the subject bearing the earlier status word.
//
// Deliberately uses names/entities unrelated to any real case on file, to
// prove the fix is a generic grammatical check and not keyed to specific
// vocabulary.
import { reasonForensically } from '../server/forensicReasoner';
import { inferLegalContext } from '../server/legalOntology';
import type { EvidenceModel } from '../server/evidenceModel';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
  cond ? pass++ : fail++;
}

function actorMatrixFor(statement: string, actors: Array<{ actor: string; entity_type: string }>) {
  const em: EvidenceModel = {
    source_role: 'bap', source_role_confidence: 90, source_role_signals: [],
    statements: [{ statement, page: 1, quote: statement } as any],
    textual_facts: [], party_claims: [], anomalies: [], adverse_evidence: [], supporting_evidence: [], missing_facts: [],
    actors: actors.map(a => ({
      actor: a.actor, roles: [], pages: [1], evidence_quotes: ['x'],
      entity_type: a.entity_type, canonical_key: `${a.entity_type}:${a.actor.toLowerCase()}`,
      aliases: [a.actor],
    } as any)),
    timeline: [], document_exhibits: [], issue_seeds: [],
  };
  const ctx = inferLegalContext('penggelapan dana perusahaan');
  const fr = reasonForensically({ title: 't', primaryDomain: ctx.primary.id, domainContext: ctx, evidence: em, lawCandidates: [] });
  const byName: Record<string, string> = {};
  for (const a of (fr as any).actor_matrix || []) byName[a.actor] = a.explicit_rights_obligations;
  return byName;
}

const FALLBACK = 'Hak, kewajiban, kapasitas, dan kewenangan tidak diinferensikan otomatis; tetapkan hanya dari dokumen sumber dan norma yang telah diverifikasi.';

// 1. "oleh X kepada Y" in one unpunctuated clause: neither X nor Y should
//    inherit the earlier "sebagai Saksi" status - that status belongs to
//    an implicit subject ("ia"), not to either named party.
{
  const statement = "081234567 ---------- ia diperiksa sebagai Saksi dalam perkara dugaan penggelapan dana oleh PT Nusantara Jaya kepada Penerima Hendra Wijaya Tahun 2021 atas nama tersangka Budi.";
  const matrix = actorMatrixFor(statement, [
    { actor: 'Hendra Wijaya', entity_type: 'PERSON' },
    { actor: 'PT Nusantara Jaya', entity_type: 'ORGANIZATION' },
  ]);
  check('recipient after "kepada" does not inherit an earlier status word', matrix['Hendra Wijaya'] === FALLBACK, matrix['Hendra Wijaya']);
  check('agent after "oleh" does not inherit an earlier status word', matrix['PT Nusantara Jaya'] === FALLBACK, matrix['PT Nusantara Jaya']);
}

// 2. Positive control: a name directly bearing its own status word, with
//    no intervening "kepada"/"oleh", must still be picked up.
{
  const statement = "Sdr. Hendra Wijaya bertindak selaku Direktur Utama perusahaan tersebut.";
  const matrix = actorMatrixFor(statement, [{ actor: 'Hendra Wijaya', entity_type: 'PERSON' }]);
  check('a name directly bearing its own status word is still captured', matrix['Hendra Wijaya'] !== FALLBACK, matrix['Hendra Wijaya']);
}

// 3. Positive control: "kepada"/"oleh" present elsewhere in the clause but
//    not between the keyword and this particular name - should still match.
{
  const statement = "Hendra Wijaya bertindak selaku kuasa hukum dan menyampaikan somasi kepada pihak lawan.";
  const matrix = actorMatrixFor(statement, [{ actor: 'Hendra Wijaya', entity_type: 'PERSON' }]);
  check('a preposition after the name/keyword pair does not block a real match', matrix['Hendra Wijaya'] !== FALLBACK, matrix['Hendra Wijaya']);
}

console.log(`\nSUMMARY ${pass}/${pass + fail} actor-status-object-preposition checks PASS`);
if (fail > 0) process.exit(1);
