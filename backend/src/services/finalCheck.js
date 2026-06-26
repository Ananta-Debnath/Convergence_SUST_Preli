/**
 * QueueStorm Investigator — Orchestrator.
 *
 * The semantic classification (case_type, severity, department,
 * agent_summary, recommended_next_action, reason_codes, confidence) is
 * produced by the external LLM service and passed in via `llmOutput`.
 * This module:
 *   1. Validates `llmOutput` against the allowed enums.
 *   2. Re-derives the customer-facing `customer_reply` from
 *      `generateCustomerReply` so the safety footer + bilingual copy
 *      always win — LLM drafts are intentionally discarded.
 *   3. Computes `human_review_required` deterministically via
 *      `humanReview.decideHumanReview` (samples/tasks.txt).
 *   4. Assembles the final triage payload.
 *
 * @param {Object} input
 * @param {string} input.ticket_id
 * @param {string} input.complaint
 * @param {string} input.language                - 'en' | 'bn' | 'mixed'
 * @param {string} [input.channel]
 * @param {string} [input.user_type='customer']
 * @param {Array}  input.transaction_history
 * @param {string} input.evidence_verdict         - 'consistent' | 'inconsistent' | 'insufficient_data'
 * @param {string} [input.relevant_transaction_id]
 * @param {Object} input.llmOutput               - externally computed LLM triage
 * @param {string} input.llmOutput.case_type
 * @param {string} input.llmOutput.severity
 * @param {string} input.llmOutput.department
 * @param {string} input.llmOutput.agent_summary
 * @param {string} input.llmOutput.recommended_next_action
 * @param {Array<string>} input.llmOutput.reason_codes
 * @param {number} [input.llmOutput.confidence=0.5]
 *
 * @returns {Object} final triage payload
 */
const { ALLOWED_ENUMS } = require('../config/triageConfig');
const { decideHumanReview } = require('./humanReview');
const { generateCustomerReply } = require('./generateReply');

class TriageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TriageValidationError';
  }
}

function assertEnum(field, value, allowed) {
  if (!allowed.includes(value)) {
    throw new TriageValidationError(
      `Invalid ${field}: "${value}". Allowed: ${allowed.join(', ')}`
    );
  }
}

function validateLlmOutput(llmOutput) {
  if (!llmOutput || typeof llmOutput !== 'object') {
    throw new TriageValidationError('llmOutput must be an object');
  }
  assertEnum('case_type', llmOutput.case_type, ALLOWED_ENUMS.case_type);
  assertEnum('severity', llmOutput.severity, ALLOWED_ENUMS.severity);
  assertEnum('department', llmOutput.department, ALLOWED_ENUMS.department);

  if (typeof llmOutput.agent_summary !== 'string' || llmOutput.agent_summary.trim() === '') {
    throw new TriageValidationError('llmOutput.agent_summary must be a non-empty string');
  }
  if (typeof llmOutput.recommended_next_action !== 'string' || llmOutput.recommended_next_action.trim() === '') {
    throw new TriageValidationError('llmOutput.recommended_next_action must be a non-empty string');
  }
  if (!Array.isArray(llmOutput.reason_codes) || llmOutput.reason_codes.some((c) => typeof c !== 'string')) {
    throw new TriageValidationError('llmOutput.reason_codes must be an array of strings');
  }
}

function validateRequest(reqBody) {
  if (!reqBody || typeof reqBody !== 'object') {
    throw new TriageValidationError('Request body must be an object');
  }
  const { ticket_id, complaint, language, evidence_verdict, transaction_history, user_type, channel } = reqBody;

  if (!ticket_id) throw new TriageValidationError('ticket_id is required');
  if (!complaint || typeof complaint !== 'string') throw new TriageValidationError('complaint is required');

  const lang = language || 'en';
  assertEnum('language', lang, ALLOWED_ENUMS.language);

  if (user_type) assertEnum('user_type', user_type, ALLOWED_ENUMS.user_type);
  if (channel) assertEnum('channel', channel, ALLOWED_ENUMS.channel);

  const verdict = evidence_verdict || 'insufficient_data';
  assertEnum('evidence_verdict', verdict, ALLOWED_ENUMS.evidence_verdict);

  return {
    ticket_id,
    complaint,
    language: lang,
    user_type: user_type || 'customer',
    channel: channel || null,
    transaction_history: Array.isArray(transaction_history) ? transaction_history : [],
    evidence_verdict: verdict,
    relevant_transaction_id: reqBody.relevant_transaction_id || null,
  };
}

function analyzeAgentSummary(reqBody) {
  const input = validateRequest(reqBody);
  const llmOutput = reqBody.llmOutput || {};
  validateLlmOutput(llmOutput);

  // Always re-derive the customer-facing reply from the safe template so
  // the PIN/OTP footer + bilingual copy win. The LLM's draft is discarded
  // by design.
  const customer_reply = generateCustomerReply({
    case_type: llmOutput.case_type,
    evidence_verdict: input.evidence_verdict,
    relevant_transaction_id: input.relevant_transaction_id,
    language: input.language,
    user_type: input.user_type,
  });

  const human_review_required = decideHumanReview({
    case_type: llmOutput.case_type,
    evidence_verdict: input.evidence_verdict,
    transaction_history: input.transaction_history,
  });

  return {
    ticket_id: input.ticket_id,
    relevant_transaction_id: input.relevant_transaction_id,
    evidence_verdict: input.evidence_verdict,
    case_type: llmOutput.case_type,
    severity: llmOutput.severity,
    department: llmOutput.department,
    agent_summary: llmOutput.agent_summary,
    recommended_next_action: llmOutput.recommended_next_action,
    customer_reply,
    reason_codes: llmOutput.reason_codes,
    confidence: typeof llmOutput.confidence === 'number' ? llmOutput.confidence : 0.5,
    human_review_required,
  };
}

module.exports = {
  analyzeAgentSummary,
  TriageValidationError,
};
