/**
 * Resolves Severity and Department using Single-Exit State Mutation
 */
function resolveRoutingAndSeverity(caseType, evidenceVerdict) {
  // 1. Initialize baseline fallback state
  let assignedSeverity = 'low';
  let assignedDept = 'customer_support';

  // 2. Mutate state based on matched archetype
  if (caseType === 'phishing_or_social_engineering') {
    assignedSeverity = 'critical';
    assignedDept = 'fraud_risk';

  } else if (caseType === 'payment_failed' || caseType === 'duplicate_payment') {
    assignedSeverity = 'high';
    assignedDept = 'payments_ops';

  } else if (caseType === 'agent_cash_in_issue') {
    assignedSeverity = 'high';
    assignedDept = 'agent_operations';

  } else if (caseType === 'merchant_settlement_delay') {
    assignedSeverity = 'medium';
    assignedDept = 'merchant_operations';

  } else if (caseType === 'wrong_transfer') {
    assignedSeverity = (evidenceVerdict === 'consistent') ? 'high' : 'medium';
    assignedDept = 'dispute_resolution';
  }

  // 3. Single deterministic exit point
  return {
    severity: assignedSeverity,
    department: assignedDept
  };
}

module.exports = { resolveRoutingAndSeverity };