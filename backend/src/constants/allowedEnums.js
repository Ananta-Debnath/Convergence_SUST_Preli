'use strict';

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

module.exports = { ALLOWED_ENUMS };