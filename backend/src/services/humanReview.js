/**
 * Deterministic `human_review_required` decision, per samples/tasks.txt:
 *   true  if evidence_verdict === 'insufficient_data' AND no transaction history
 *   false for case_type in {payment_failed, refund_request, merchant_settlement_delay}
 *   otherwise fall back to per-case_type defaults in HUMAN_REVIEW_DEFAULTS.
 *
 * @param {Object} params
 * @param {string} params.case_type         - LLM-produced case_type (already enum-validated)
 * @param {string} params.evidence_verdict  - 'consistent' | 'inconsistent' | 'insufficient_data'
 * @param {Array}  [params.transaction_history] - may be null/undefined
 * @returns {boolean}
 */
const { HUMAN_REVIEW_DEFAULTS } = require('../config/triageConfig');

function decideHumanReview({ case_type, evidence_verdict, transaction_history }) {
  const hasHistory = Array.isArray(transaction_history) && transaction_history.length > 0;

  // Rule 1: vague complaints with no history always need a human.
  if (evidence_verdict === 'insufficient_data' && !hasHistory) {
    return true;
  }

  // Rule 2: explicit auto-resolvable flows.
  if (
    case_type === 'payment_failed' ||
    case_type === 'refund_request' ||
    case_type === 'merchant_settlement_delay'
  ) {
    return false;
  }

  // Rule 3: per-case default.
  return HUMAN_REVIEW_DEFAULTS[case_type] !== false;
}

module.exports = { decideHumanReview };