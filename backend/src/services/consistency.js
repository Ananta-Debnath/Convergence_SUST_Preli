/**
 * QueueStorm Investigator — Consistency Engine
 * Deterministic 3-phase pipeline:
 *   Phase 1 — Entity Extraction  (amount, counterparty, intent flags)
 *   Phase 2 — Array Filtering    (candidate transaction subset)
 *   Phase 3 — Verdict Logic Tree (consistent / inconsistent / insufficient_data)
 *
 * @param {string} complaint            - Raw complaint text from the user
 * @param {Array}  transaction_history  - Array of transaction objects from the payload
 * @returns {{ verdict: string, confidence: number }} verdict + confidence (0.0–1.0)
 */
function analyzeConsistency(complaint, transaction_history = []) {

  // ─────────────────────────────────────────────────────────────
  // PHASE 1 — ENTITY EXTRACTION
  // ─────────────────────────────────────────────────────────────

  const rawText = complaint || '';

  // Normalise Bengali/Devanagari digits → ASCII so regex can parse them
  const normaliseBengaliDigits = (s) =>
    s.replace(/[\u09E6-\u09EF]/g, (ch) => String(ch.codePointAt(0) - 0x09E6));

  const text = normaliseBengaliDigits(rawText);

  // 1a. Extract target amount — first standalone integer,
  //     skipping plausible years (1900-2099) and single-digit noise.
  const amountMatches = text.match(/\b(\d+)\b/g) || [];
  const candidateAmounts = amountMatches
    .map(Number)
    // Exclude obvious calendar years (1900-1999 only); 2000+ are valid money amounts
    .filter(n => n >= 10 && !(n >= 1900 && n <= 1999));
  const targetAmount = candidateAmounts.length > 0 ? candidateAmounts[0] : null;

  // 1b. Extract counterparty — BD phone number, MERCHANT-ID, AGENT-ID
  const phoneRegex    = /(?:\+88)?01[3-9]\d{8}/g;
  const merchantRegex = /MERCHANT-[\w-]+/gi;
  const agentRegex    = /AGENT-\d+/gi;

  const phoneMatches    = text.match(phoneRegex)    || [];
  const merchantMatches = text.match(merchantRegex) || [];
  const agentMatches    = text.match(agentRegex)    || [];

  const normalisePhone = (p) => p.startsWith('+88') ? p : `+88${p}`;

  let targetCounterparty = null;
  if (phoneMatches.length > 0) {
    targetCounterparty = normalisePhone(phoneMatches[0]);
  } else if (merchantMatches.length > 0) {
    targetCounterparty = merchantMatches[0].toUpperCase();
  } else if (agentMatches.length > 0) {
    targetCounterparty = agentMatches[0].toUpperCase();
  }

  // 1c. Intent flags
  const lowerText = text.toLowerCase();

  const isDuplicateIntent =
    /\btwice\b|\bdouble\b|\bagain\b|\bdeducted twice\b|\bcharged twice\b/.test(lowerText);

  const isFraudIntent =
    /\botp\b|\bpin\b|\bblock\b|\bcall(ed)?\b/.test(lowerText);

  const isMistakeIntent =
    /\bwrong\b|\bmistake\b|\berror\b/.test(lowerText);

  // Truly vague: no amount, no counterparty, no strong intent keyword
  const isVagueComplaint =
    targetAmount === null &&
    targetCounterparty === null &&
    !isDuplicateIntent &&
    !isFraudIntent &&
    !isMistakeIntent;

  // ── Extraction quality score (0.0–1.0) ──────────────────────
  // Measures how much usable evidence the complaint text provided.
  //   amount found       → +0.35
  //   counterparty found → +0.25
  //   intent detected    → +0.20
  //   has any history    → +0.20
  let extractionQuality = 0.0;
  if (targetAmount !== null)       extractionQuality += 0.35;
  if (targetCounterparty !== null) extractionQuality += 0.25;
  if (isDuplicateIntent || isFraudIntent || isMistakeIntent) extractionQuality += 0.20;
  if (transaction_history && transaction_history.length > 0)  extractionQuality += 0.20;

  // ─────────────────────────────────────────────────────────────
  // PHASE 2 — ARRAY FILTERING
  // ─────────────────────────────────────────────────────────────

  const history = Array.isArray(transaction_history) ? transaction_history : [];

  let candidates = [...history];

  // 2a. Filter by amount
  if (targetAmount !== null) {
    candidates = candidates.filter(tx => Number(tx.amount) === targetAmount);
  }

  // 2b. Further filter by counterparty (only if it narrows the set)
  if (targetCounterparty !== null && candidates.length > 0) {
    const cpLower = targetCounterparty.toLowerCase();
    const filtered = candidates.filter(tx => {
      if (!tx.counterparty) return false;
      const txCp       = tx.counterparty.toLowerCase();
      const normTxCp   = txCp.startsWith('01')   ? `+88${txCp}`   : txCp;
      const normTarget = cpLower.startsWith('01') ? `+88${cpLower}` : cpLower;
      return normTxCp === normTarget;
    });
    if (filtered.length > 0) candidates = filtered;
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 3 — VERDICT LOGIC TREE
  // ─────────────────────────────────────────────────────────────

  // ── BRANCH A: Zero candidates or vague complaint ─────────────
  if (candidates.length === 0 || isVagueComplaint) {
    // Fraud intent gives a slight bump even without matching transactions
    const conf = isFraudIntent
      ? Math.min(extractionQuality + 0.15, 0.55)
      : Math.max(extractionQuality * 0.6, 0.20);
    return { verdict: 'insufficient_data', confidence: parseFloat(conf.toFixed(2)) };
  }

  // ── BRANCH C: Multiple candidates ───────────────────────────
  if (candidates.length >= 2) {
    const uniqueCounterparties = new Set(
      candidates.map(tx => (tx.counterparty || '').toLowerCase())
    );

    if (uniqueCounterparties.size === 1) {
      // Same counterparty — check if clustered in time (duplicate payment)
      const sorted = [...candidates].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
      const firstTs  = new Date(sorted[0].timestamp).getTime();
      const lastTs   = new Date(sorted[sorted.length - 1].timestamp).getTime();
      const diffSecs = (lastTs - firstTs) / 1000;

      if (diffSecs <= 600) {
        const duplicateTx = sorted[sorted.length - 1]; // second tx is suspect
        // Tighter timestamp gap → higher confidence
        const timeBonus = diffSecs <= 60 ? 0.10 : 0.0;
        const conf = Math.min(extractionQuality + 0.15 + timeBonus, 0.98);
        return { verdict: 'consistent', confidence: parseFloat(conf.toFixed(2)) };
      }
    }

    // Different counterparties or wide time spread — ambiguous
    const conf = Math.max(extractionQuality * 0.65, 0.30);
    return { verdict: 'insufficient_data', confidence: parseFloat(conf.toFixed(2)) };
  }

  // ── BRANCH B: Exactly one candidate ─────────────────────────
  const match = candidates[0];

  // Contradiction 1 — established recipient pattern
  // User claims wrong transfer but has sent to this number 2+ times before
  if (isMistakeIntent && match.counterparty) {
    const priorTransfers = history.filter(
      tx =>
        tx.transaction_id !== match.transaction_id &&
        tx.type === 'transfer' &&
        (tx.counterparty || '').toLowerCase() ===
          (match.counterparty || '').toLowerCase()
    );
    if (priorTransfers.length >= 2) {
      // More prior transfers → stronger contradiction signal
      const patternStrength = Math.min(priorTransfers.length * 0.08, 0.20);
      const conf = Math.min(extractionQuality + patternStrength, 0.95);
      return { verdict: 'inconsistent', confidence: parseFloat(conf.toFixed(2)) };
    }
  }

  // Contradiction 2 — type mismatch between complaint language and ledger type
  const transferKeywords = /\b(transfer|send|sent)\b/i;
  const paymentKeywords  = /\b(pay|paid|payment|recharge|bill)\b/i;

  if (transferKeywords.test(text) && match.type === 'cash_in') {
    const conf = Math.min(extractionQuality + 0.10, 0.90);
    return { verdict: 'inconsistent', confidence: parseFloat(conf.toFixed(2)) };
  }

  if (paymentKeywords.test(text) && match.type === 'transfer') {
    const conf = Math.min(extractionQuality + 0.10, 0.90);
    return { verdict: 'inconsistent', confidence: parseFloat(conf.toFixed(2)) };
  }

  // Perfect match — story aligns with ledger
  // Both amount + counterparty matched → top confidence; amount only → slightly less
  const matchBonus = targetCounterparty !== null ? 0.15 : 0.05;
  const conf = Math.min(extractionQuality + matchBonus, 0.98);
  return { verdict: 'consistent', confidence: parseFloat(conf.toFixed(2)) };
}

module.exports = { analyzeConsistency };