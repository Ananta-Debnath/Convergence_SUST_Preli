/**
 * Unified Next Action Generator (Single-Exit State Mutation)
 * @param {Object} triageState - The resolved ticket object
 * @returns {string} The compliant internal action directive
 */
function generateMasterNextAction(triageState) {
  const {
    case_type,
    evidence_verdict,
    department,
    human_review_required,
    relevant_transaction_id
  } = triageState;

  const txnRef = relevant_transaction_id || "the reported transaction";

  // 1. Initialize safe automated fallback state
  let assignedAction = `Process ${case_type} via standard automated workflows. No manual agent intervention required.`;

  // 2. Mutate state based on the Boolean Gate
  if (human_review_required) {
    // --- PATH A: MANUAL HUMAN REVIEW REQUIRED ---
    if (case_type === 'phishing_or_social_engineering') {
      assignedAction = "Escalate to fraud_risk team immediately. Confirm to customer that the company never asks for OTP. Log the reported number for fraud pattern analysis.";

    } else if (case_type === 'duplicate_payment') {
      assignedAction = `Verify the duplicate with ${department}. If the biller confirms only one payment was received, initiate reversal of ${txnRef}.`;

    } else if (case_type === 'agent_cash_in_issue') {
      assignedAction = `Investigate ${txnRef} pending status with ${department}. Confirm settlement state and resolve within the standard cash-in SLA.`;

    } else if (case_type === 'wrong_transfer') {
      assignedAction = (evidence_verdict === 'inconsistent')
        ? `Flag for human review. Verify with the customer whether this was genuinely a wrong transfer given the established transaction pattern with this recipient.`
        : `Verify ${txnRef} details with the customer and initiate the wrong-transfer dispute workflow per policy.`;

    } else {
      assignedAction = `Route ticket to ${department} queue for manual investigation and customer follow-up.`;
    }

  } else {
    // --- PATH B: AUTOMATED / BOT HANDLING ---
    if (evidence_verdict === 'insufficient_data') {
      assignedAction = (case_type === 'wrong_transfer')
        ? "Reply to customer asking for the brother's number to identify the correct transaction. Do not initiate dispute until the transaction is confirmed."
        : "Reply to customer asking for specific details: which transaction, what amount, what went wrong, and approximate time.";

    } else if (case_type === 'refund_request') {
      assignedAction = "Inform the customer that refund eligibility depends on the merchant's own policy. Provide guidance on contacting the merchant directly for a refund.";

    } else if (case_type === 'payment_failed') {
      assignedAction = `Investigate ${txnRef} ledger status. If balance was deducted on a failed payment, initiate the automatic reversal flow within standard SLA.`;

    } else if (case_type === 'merchant_settlement_delay') {
      assignedAction = `Route to ${department} to verify settlement batch status. If the batch is delayed, communicate a revised ETA to the merchant.`;
    }
  }

  // 3. Single deterministic exit point
  return assignedAction;
}

module.exports = { generateMasterNextAction };