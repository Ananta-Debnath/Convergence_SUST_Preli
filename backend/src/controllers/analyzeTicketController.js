const { classifyTicketWithConfidence } = require('../services/classify.js');
const { analyzeConsistency } = require('../services/consistency.js');
const { analyzeAgentSummary } = require('../services/agentsummary.js');
const { resolveRoutingAndSeverity } = require('../services/severity_department.js');
const { decideHumanReview } = require('../services/humanReview.js');

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

const analyzeTicket = async (req, res) => {
  try {
    const body = req.body || {};
    const { case_type, classifyConfidence, reason_codes } = classifyTicketWithConfidence(body);
    const { verdict, confidence, relevant_transaction_id } = analyzeConsistency(body.complaint, body.transaction_history || []);
    const { severity, department } = resolveRoutingAndSeverity(case_type, verdict);
    const humanReviewRequired = decideHumanReview({ case_type, evidence_verdict: verdict });
    // const agent_summary = analyzeAgentSummary(body);

    return res.status(200).json({
      ticket_id: body.ticket_id || null,
      relevant_transaction_id: relevant_transaction_id,
      evidence_verdict: verdict,
      case_type: case_type,
      severity: severity,
      department: department,
      agent_summary: null,
      recommended_next_action: null,
      customer_reply: null,
      human_review_required: humanReviewRequired,
      confidence: null,
      reason_codes: reason_codes
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

module.exports = { analyzeTicket, ALLOWED_ENUMS };
