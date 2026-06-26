/**
 * Shared enums + human_review rules for the QueueStorm Investigator pipeline.
 * The semantic classification itself (case_type / severity / department /
 * agent_summary / recommended_next_action / reason_codes / confidence) is
 * computed by the external LLM service and passed in as input. This module
 * is consumed by the orchestrator to validate the LLM output against the
 * allowed enums and to compute `human_review_required` deterministically
 * from `samples/tasks.txt`.
 */

const ALLOWED_ENUMS = {
  language: ['en', 'bn', 'mixed'],
  channel: ['in_app_chat', 'call_center', 'email', 'merchant_portal', 'field_agent'],
  user_type: ['customer', 'merchant', 'agent', 'unknown'],
  transaction_type: ['transfer', 'payment', 'cash_in', 'cash_out', 'settlement', 'refund'],
  transaction_status: ['completed', 'failed', 'pending', 'reversed'],
  evidence_verdict: ['consistent', 'inconsistent', 'insufficient_data'],
  case_type: [
    'wrong_transfer',
    'payment_failed',
    'refund_request',
    'duplicate_payment',
    'merchant_settlement_delay',
    'agent_cash_in_issue',
    'phishing_or_social_engineering',
    'other',
  ],
  severity: ['low', 'medium', 'high', 'critical'],
  department: [
    'customer_support',
    'dispute_resolution',
    'payments_ops',
    'merchant_operations',
    'agent_operations',
    'fraud_risk',
  ],
};

/**
 * Per samples/tasks.txt:
 *   human_review_required = true  if insufficient_data AND transaction_history null
 *                          false for payment_failed, refund_request, merchant_settlement_delay
 * The remaining case_types default to true (they involve money movement,
 * dispute routing, or fraud signalling and always warrant human eyes).
 */
const HUMAN_REVIEW_DEFAULTS = {
  // Always false — explicitly listed in tasks.txt as auto-resolvable flows.
  payment_failed: false,
  refund_request: false,
  merchant_settlement_delay: false,
  // Always true — dispute / fraud / agent-side / unknown.
  wrong_transfer: true,
  duplicate_payment: true,
  agent_cash_in_issue: true,
  phishing_or_social_engineering: true,
  other: true,
};

module.exports = {
  ALLOWED_ENUMS,
  HUMAN_REVIEW_DEFAULTS,
};