/**
 * Smoke test: run analyzeAgentSummary against the orchestrator-only path.
 * The LLM is stubbed — these are pre-computed `llmOutput` blobs that mirror
 * what the external classifier is expected to produce.
 *
 * Run with: node backend/tests/agentsummary.smoke.js
 */
const { analyzeAgentSummary } = require('../src/services/agentsummary');

const cases = [
  {
    name: 'SAMPLE-01 wrong_transfer / consistent (en)',
    input: {
      ticket_id: 'TKT-001',
      complaint: 'I sent 5000 taka to a wrong number around 2pm today.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      evidence_verdict: 'consistent',
      relevant_transaction_id: 'TXN-9101',
      transaction_history: [
        { transaction_id: 'TXN-9101', type: 'transfer', amount: 5000, counterparty: '+8801719876543', status: 'completed' },
      ],
      llmOutput: {
        case_type: 'wrong_transfer',
        severity: 'high',
        department: 'dispute_resolution',
        agent_summary: 'Customer reports sending 5000 BDT via TXN-9101 to a number they now believe was wrong; recipient unresponsive.',
        recommended_next_action: 'Verify TXN-9101 with the customer and initiate the wrong-transfer dispute workflow per policy.',
        reason_codes: ['wrong_transfer', 'transaction_match', 'dispute_initiated'],
        confidence: 0.9,
      },
    },
    expect: { case_type: 'wrong_transfer', human_review_required: true, lang: 'en' },
  },
  {
    name: 'SAMPLE-07 agent_cash_in / bn',
    input: {
      ticket_id: 'TKT-007',
      complaint: 'আমি আজ সকালে এজেন্টের কাছে ২০০০ টাকা ক্যাশ ইন করেছি কিন্তু আমার ব্যালেন্সে টাকা আসেনি।',
      language: 'bn',
      channel: 'call_center',
      user_type: 'customer',
      evidence_verdict: 'consistent',
      relevant_transaction_id: 'TXN-9701',
      transaction_history: [
        { transaction_id: 'TXN-9701', type: 'cash_in', amount: 2000, counterparty: 'AGENT-318', status: 'pending' },
      ],
      llmOutput: {
        case_type: 'agent_cash_in_issue',
        severity: 'high',
        department: 'agent_operations',
        agent_summary: 'গ্রাহক জানিয়েছেন AGENT-318 এর মাধ্যমে ২০০০ টাকা ক্যাশ ইন (TXN-9701) এখনও ব্যালেন্সে প্রতিফলিত হয়নি; লেনদেন pending।',
        recommended_next_action: 'TXN-9701 এর pending স্ট্যাটাস agent operations দিয়ে যাচাই করুন এবং স্ট্যান্ডার্ড SLA-র মধ্যে নিষ্পত্তি করুন।',
        reason_codes: ['agent_cash_in', 'pending_transaction', 'agent_ops'],
        confidence: 0.88,
      },
    },
    expect: { case_type: 'agent_cash_in_issue', human_review_required: true, lang: 'bn' },
  },
  {
    name: 'payment_failed auto-resolvable (en)',
    input: {
      ticket_id: 'TKT-PF1',
      complaint: 'My mobile recharge failed but money was deducted.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      evidence_verdict: 'consistent',
      relevant_transaction_id: 'TXN-2200',
      transaction_history: [
        { transaction_id: 'TXN-2200', type: 'payment', amount: 100, status: 'failed' },
      ],
      llmOutput: {
        case_type: 'payment_failed',
        severity: 'medium',
        department: 'payments_ops',
        agent_summary: 'Customer reports TXN-2200 mobile recharge of 100 BDT failed but funds were deducted.',
        recommended_next_action: 'Confirm TXN-2200 reversal status with the biller and ensure the amount is returned.',
        reason_codes: ['payment_failed', 'reversal_pending'],
        confidence: 0.82,
      },
    },
    expect: { case_type: 'payment_failed', human_review_required: false, lang: 'en' },
  },
  {
    name: 'Vague complaint with no history → escalate',
    input: {
      ticket_id: 'TKT-VAG',
      complaint: 'Something is wrong with my account please help.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      evidence_verdict: 'insufficient_data',
      relevant_transaction_id: null,
      transaction_history: [],
      llmOutput: {
        case_type: 'other',
        severity: 'medium',
        department: 'customer_support',
        agent_summary: 'Customer reported an unspecified account issue with no transaction context.',
        recommended_next_action: 'Ask the customer for the transaction ID, amount, and a short description of what went wrong.',
        reason_codes: ['insufficient_data', 'request_more_info'],
        confidence: 0.4,
      },
    },
    expect: { case_type: 'other', human_review_required: true, lang: 'en' },
  },
];

function assert(cond, msg) {
  if (!cond) {
    console.error('  FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ok  :', msg);
  }
}

for (const tc of cases) {
  console.log('\nCASE:', tc.name);
  const out = analyzeAgentSummary(tc.input);

  assert(out.case_type === tc.expect.case_type, `case_type = ${out.case_type}`);
  assert(out.human_review_required === tc.expect.human_review_required, `human_review_required = ${out.human_review_required}`);
  assert(typeof out.customer_reply === 'string' && out.customer_reply.length > 0, 'customer_reply is non-empty');
  // Forbidden phrases: requesting/confirming credentials, promising a refund.
// "Please do not share your PIN or OTP" (the safety footer) is allowed and
// must NOT be matched — so we require a leading verb that *requests* input.
assert(!/\b(send|tell|give|enter|provide|reply with|forward)\s+(me\s+|us\s+)?(your\s+)?(pin|otp|password|cvv|card number)/i.test(out.customer_reply), 'customer_reply does not request credentials');
assert(!/\bwe\s+will\s+refund\b/i.test(out.customer_reply), 'customer_reply does not promise a refund');
  assert(out.reason_codes.length > 0, 'reason_codes is non-empty');
  assert(typeof out.confidence === 'number' && out.confidence >= 0 && out.confidence <= 1, 'confidence is in [0,1]');
  if (tc.expect.lang === 'bn') {
    assert(/[\u0980-\u09FF]/.test(out.customer_reply), 'customer_reply contains Bangla script');
  } else {
    assert(!/[\u0980-\u09FF]/.test(out.customer_reply), 'customer_reply is English (no Bangla script)');
  }

  console.log('  summary:', out.agent_summary.slice(0, 80) + '...');
  console.log('  reply  :', out.customer_reply.slice(0, 80) + '...');
  console.log('  hr     :', out.human_review_required, '| dept:', out.department, '| sev:', out.severity);
}

console.log('\nDone. Exit code:', process.exitCode || 0);