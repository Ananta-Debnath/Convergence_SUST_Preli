/**
 * QueueStorm Investigator — Human Review Decision Engine
 *
 * Deterministic 5-step priority cascade that decides whether a ticket
 * must be escalated to a human support agent.
 *
 * Decision Workflow (evaluated top-to-bottom, first match wins):
 *
 *   Step 1 — FRAUD OVERRIDE:     phishing_or_social_engineering → always true
 *   Step 2 — CLARIFICATION BLOCK: insufficient_data             → always false
 *   Step 3 — CONTRADICTION CATCH: inconsistent                  → always true
 *   Step 4 — CONSISTENT ROUTING:  split by operational authority
 *              Manual   → wrong_transfer, agent_cash_in_issue, duplicate_payment  → true
 *              Automated → payment_failed, refund_request, merchant_settlement_delay → false
 *   Step 5 — DEFAULT FALLBACK:    'other' or any edge case      → false
 *
 * @param {Object}  params
 * @param {string}  params.case_type         - Validated case_type enum
 * @param {string}  params.evidence_verdict  - 'consistent' | 'inconsistent' | 'insufficient_data'
 * @returns {boolean}  true if a human agent must review, false otherwise
 */
function decideHumanReview({ case_type, evidence_verdict }) {

  // ─── Step 1: Fraud & Security Override ──────────────────────────
  // Any indication of phishing / social engineering is an immediate
  // escalation to the fraud_risk team, regardless of evidence state.
  if (case_type === 'phishing_or_social_engineering') {
    return true;
  }

  // ─── Step 2: Clarification Block ────────────────────────────────
  // If the evidence is insufficient (vague complaint, ambiguous matches),
  // the AI should ask the user for more info first.
  // Do NOT waste a human agent's time on a ticket missing basic facts.
  if (evidence_verdict === 'insufficient_data') {
    return false;
  }

  // ─── Step 3: Contradiction Catch ────────────────────────────────
  // If the user's claim conflicts with the ledger data, a human must
  // investigate whether the user is confused or attempting fraud.
  if (evidence_verdict === 'inconsistent') {
    return true;
  }

  // ─── Step 4: Consistent Evidence — Operational Authority Split ──
  // When evidence aligns, route based on whether the case_type requires
  // human authorisation or can be handled by automated systems/policy.
  if (evidence_verdict === 'consistent') {

    // 4a. Cases requiring manual human intervention:
    //   - wrong_transfer:       Dispute authorization needed (pulling money from another account)
    //   - agent_cash_in_issue:  Must contact the physical agent for verification
    //   - duplicate_payment:    Requires biller verification before reversal
    const manualInterventionRequired = [
      'wrong_transfer',
      'agent_cash_in_issue',
      'duplicate_payment',
    ];

    // 4b. Cases handled by automated scripts or merchant policy:
    //   - payment_failed:            Auto-reversal scripts handle this
    //   - refund_request:            Merchant policy dictates the outcome
    //   - merchant_settlement_delay: System batch reconciliation handles this
    const automatedOrPolicyHandled = [
      'payment_failed',
      'refund_request',
      'merchant_settlement_delay',
    ];

    if (manualInterventionRequired.includes(case_type)) {
      return true;
    }

    if (automatedOrPolicyHandled.includes(case_type)) {
      return false;
    }
  }

  // ─── Step 5: Default Fallback ───────────────────────────────────
  // For 'other' or any unrecognised edge-case, default to no human review.
  return false;
}

module.exports = { decideHumanReview };