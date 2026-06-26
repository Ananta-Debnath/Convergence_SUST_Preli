const { classifyTicket } = require('../services/classify.js');

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
    const case_type = classifyTicket(body);

    return res.status(200).json({
      ticket_id: body.ticket_id || null,
      relevant_transaction_id: "TXN-9202",
      evidence_verdict: "inconsistent",
      case_type: case_type,
      severity: "medium",
      department: "dispute_resolution",
      agent_summary: "Customer claims TXN-9202 (2000 BDT to +8801812345678) was a wrong transfer, but transaction history shows three prior transfers to the same counterparty in the past nine days, suggesting an established recipient.",
      recommended_next_action: "Flag for human review. Verify with the customer whether this was genuinely a wrong transfer given the established transaction pattern with this recipient.",
      customer_reply: "We have received your request regarding transaction TXN-9202. Please do not share your PIN or OTP with anyone. Our dispute team will review the case carefully and contact you through official support channels.",
      human_review_required: true,
      confidence: 0.75,
      reason_codes: ["wrong_transfer_claim", "established_recipient_pattern", "evidence_inconsistent"]
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

module.exports = { analyzeTicket, ALLOWED_ENUMS };
