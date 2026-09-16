/**
 * Backward-compatibility facade. External Gemini/API-key integration has been removed.
 * New code should import from ./localReasoning.
 */
export {
  isLocalReasoningAvailable as isAIAvailable,
  getLocalReasoningStatus as getAIConfigStatus,
  generateLegalDraftAI,
  reviewContractAI,
  generateCommunicationAI,
  summarizeSourceDeterministically,
} from './localReasoning';

export function getAI(){ return null; }
export function getModelPool(){ return ['lexicore-local-v2']; }
export function getCaseAnalysisModelPool(){ return ['lexicore-deterministic-forensic-v2']; }
export function getActiveModel(){ return 'lexicore-local-v2'; }
