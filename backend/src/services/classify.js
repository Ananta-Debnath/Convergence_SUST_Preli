'use strict';

const path = require('path');
const fs = require('fs');

const { ALLOWED_ENUMS } = require('../constants/allowedEnums.js');

const case_type_enum = ALLOWED_ENUMS.case_type;

// ---------------------------------------------------------------------------
// Keyword banks (English + Bangla). Order inside each bank does not matter;
// priority between case types is enforced in `runDetectors` below.
// ---------------------------------------------------------------------------
const KEYWORDS = {
  phishing: [
    // English
    'otp', 'pin', 'password', 'one time password', 'share my', 'asked for my',
    'asking for my', 'claim to be', 'claiming to be', 'said they are',
    'bikash', 'bkash', 'nagad', 'rocket', 'staff', 'representative',
    'verify', 'verification code', 'account will be blocked',
    'account will be suspended', 'urgent', 'immediately', 'phishing',
    'social engineering', 'fraud call', 'scam call',
    // Bangla
    'ওটিপি', 'পিন', 'পাসওয়ার্ড', 'ভুয়া', 'প্রতারণা', 'প্রতারক',
    'বিকাশ', 'নগদ', 'রকেট', 'কর্মী', 'যাচাই', 'হুমকি',
    'অ্যাকাউন্ট বন্ধ', 'অ্যাকাউন্ট ব্লক', 'ফোন করে',
  ],

  settlement: [
    // English
    'settlement', 'settled', 'sales', 'merchant settlement',
    'not been settled', 'not settled', 'settlement delay',
    'hasn\'t been settled', 'have not been settled', 'batch',
    // Bangla
    'সেটেলমেন্ট', 'মার্চেন্ট', 'বিক্রি', 'জমা হয়নি',
  ],

  agent_cash_in: [
    // English
    'cash in', 'cash-in', 'agent', 'cashin', 'did not receive',
    'didn\'t receive', 'not received', 'balance not updated',
    'balance not credited', 'not reflected', 'agent sent',
    // Bangla
    'ক্যাশ ইন', 'ক্যাশ-ইন', 'এজেন্ট', 'ব্যালেন্সে আসেনি',
    'ব্যালেন্সে দেখছি না', 'টাকা আসেনি', 'পাঠিয়েছে',
  ],

  duplicate_payment: [
    // English
    'twice', 'two times', 'duplicate', 'deducted twice', 'double charged',
    'charged twice', 'paid twice', 'same bill', 'deducted two times',
    'deducted 2 times',
    // Bangla
    'দুইবার', 'দুই বার', 'ডুপ্লিকেট', 'দু\'বার', 'দুইবার কেটেছে',
    'দুইবার কেটে নিয়েছে',
  ],

  payment_failed: [
    // English
    'payment failed', 'failed but', 'failed however', 'deducted but',
    'balance was deducted', 'amount deducted', 'money deducted',
    'but failed', 'showed failed', 'app showed failed',
    'recharge failed', 'transaction failed',
    // Bangla
    'পেমেন্ট ব্যর্থ', 'টাকা কেটে নিয়েছে', 'টাকা কেটে গেছে',
    'ব্যর্থ হয়েছে', 'ফ্লপ হয়েছে',
  ],

  wrong_transfer: [
    // English
    'wrong number', 'wrong person', 'wrong recipient', 'sent to wrong',
    'wrong account', 'mistakenly sent', 'sent by mistake', 'by mistake',
    'wrong transfer', 'accidentally sent', 'not responding', 'unresponsive',
    'isn\'t responding', 'not picking', 'not picking up',
    'typed it wrong', 'typed wrong',
    'didn\'t get it', 'did not get it', 'didn\'t get', 'did not get',
    'hasn\'t received', 'has not received', 'he didn\'t get', 'she didn\'t get',
    'not received', 'never received', 'didn\'t receive', 'did not receive',
    // Bangla
    'ভুল নম্বর', 'ভুল ব্যক্তি', 'ভুল করে', 'ভুলে পাঠিয়েছি',
    'ভুল ট্রান্সফার', 'ফোন ধরছে না', 'রিসিভ করছে না',
    'পায়নি', 'পাননি', 'পাইনি', 'পাইনি', 'হাতে পায়নি',
  ],

  refund: [
    // English
    'refund', 'money back', 'get my money back', 'return my money',
    'reverse', 'reverse it', 'reverse the transaction', 'chargeback',
    'changed my mind', 'don\'t want it', 'don\'t want anymore',
    'want my money back', 'want it back',
    // Bangla
    'ফেরত', 'ফেরত দিন', 'রিফান্ড', 'টাকা ফেরত', 'ফেরত চাই',
    'আমার টাকা', 'ফেরত পেতে',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lowercase + collapse whitespace for the English keyword scan.
 * Returns the original string too so callers can also Bangla-scan.
 */
const normalize = (s) => String(s || '').toLowerCase();

const hasAny = (haystack, needles) => {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
};

const isMerchant = (input) => {
  const ut = normalize(input && input.user_type);
  const text = normalize(input && input.complaint);
  return ut === 'merchant' || hasAny(text, ['merchant', 'i am a merchant', 'আমি একজন মার্চেন্ট']);
};

const getHistory = (input) => {
  const h = input && input.transaction_history;
  return Array.isArray(h) ? h : [];
};

const historyHas = (history, predicate) => history.some(predicate);

// ---------------------------------------------------------------------------
// Structural helpers. These let detectors cross-check the complaint against
// the transaction_history instead of trusting text alone. Phone-like strings
// are compared after stripping non-digits so "+8801719876543" and
// "01719876543" group together.
// ---------------------------------------------------------------------------

const stripNonDigits = (s) => String(s || '').replace(/\D+/g, '');

const counterpartyMatches = (a, b) => {
  if (!a || !b) return false;
  // First try phone-shaped comparison after stripping non-digits.
  const da = stripNonDigits(a);
  const db = stripNonDigits(b);
  if (da.length >= 7 && db.length >= 7) {
    const tail = (x) => x.slice(-10);
    const a10 = tail(da);
    const b10 = tail(db);
    if (a10.length >= 7 && b10.length >= 7 && a10 === b10) return true;
  }
  // Fall back to exact equality for non-phone identifiers (BILLER-DESCO,
  // MERCHANT-7821, AGENT-318, etc.).
  return a === b;
};

const isWithinWindowMs = (aTs, bTs, windowMs) => {
  const ta = Date.parse(aTs);
  const tb = Date.parse(bTs);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= windowMs;
};

/**
 * Latest parseable timestamp in history, or `null` if there are none. Used as
 * the reference "now" for recency checks so the detector is robust to wall
 * clock drift between when history was written and when the complaint arrives.
 */
const latestHistoryTimestamp = (history) => {
  let latest = -Infinity;
  let found = false;
  for (const t of history) {
    if (!t || !t.timestamp) continue;
    const parsed = Date.parse(t.timestamp);
    if (Number.isNaN(parsed)) continue;
    if (parsed > latest) {
      latest = parsed;
      found = true;
    }
  }
  return found ? new Date(latest).toISOString() : null;
};

const withinWindowFromLatest = (history, ts, windowMs) => {
  if (!ts) return false;
  const ref = latestHistoryTimestamp(history);
  if (!ref) return false;
  return isWithinWindowMs(ts, ref, windowMs);
};

const findCompletedOfType = (history, type) =>
  history.filter((t) => t && t.type === type && t.status === 'completed');

const findFailedOfType = (history, type) =>
  history.filter((t) => t && t.type === type && t.status === 'failed');

const findPendingOrFailedOfType = (history, type) =>
  history.filter(
    (t) =>
      t &&
      t.type === type &&
      (t.status === 'pending' || t.status === 'failed'),
  );

/**
 * Pull a numeric amount (BDT) and an optional phone-shaped counterparty out of
 * the complaint text. Conservative — only returns values when the patterns
 * are unambiguous. Bangla numerals are also accepted.
 */
const extractAmountAndCounterpartyFromComplaint = (text) => {
  const result = { amount: null, counterparty: null };
  if (!text) return result;

  const banglaDigitToAscii = (s) =>
    s.replace(/[০-৯]/g, (ch) => String(ch.charCodeAt(0) - 0x09e6));

  const ascii = banglaDigitToAscii(String(text));

  // Amount: prefer "X taka", "X tk", or "৳X". Otherwise a standalone number.
  const amountRe =
    /(?:৳\s*)?([0-9][0-9,]{1,9})(?:\s*(?:taka|tk|টাকা))?/i;
  const amtMatch = ascii.match(amountRe);
  if (amtMatch) {
    const num = Number(amtMatch[1].replace(/,/g, ''));
    if (Number.isFinite(num) && num > 0) result.amount = num;
  }

  // Counterparty: phone-shaped token, + optional, 10-15 digits total.
  const phoneRe = /(\+?\d[\d\s-]{8,14}\d)/;
  const phMatch = ascii.match(phoneRe);
  if (phMatch) {
    const candidate = phMatch[1];
    const digits = stripNonDigits(candidate);
    if (digits.length >= 10 && digits.length <= 15) {
      result.counterparty = digits;
    }
  }

  return result;
};

/**
 * Find a pair of completed payments that look like a duplicate: same amount,
 * same counterparty (digit-normalized), within the DUPLICATE_WINDOW_MS window.
 * Returns { first, second } or null. The caller treats the later timestamp as
 * the suspected duplicate (matches SAMPLE-10 rationale).
 */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const findDuplicatePair = (history) => {
  const payments = findCompletedOfType(history, 'payment');
  if (payments.length < 2) return null;

  for (let i = 0; i < payments.length; i += 1) {
    for (let j = i + 1; j < payments.length; j += 1) {
      const a = payments[i];
      const b = payments[j];
      if (a.amount !== b.amount) continue;
      if (!counterpartyMatches(a.counterparty, b.counterparty)) continue;
      if (!isWithinWindowMs(a.timestamp, b.timestamp, DUPLICATE_WINDOW_MS)) {
        continue;
      }
      // Order the pair chronologically so `second` is the suspected duplicate.
      const ta = Date.parse(a.timestamp);
      const tb = Date.parse(b.timestamp);
      return ta <= tb ? { first: a, second: b } : { first: b, second: a };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Individual detectors. Each returns `true` if the input matches that case.
// Order in `runDetectors` is the priority order; do not reorder casually.
// ---------------------------------------------------------------------------

const isPhishing = (input) => {
  const text = normalize(input && input.complaint);
  return hasAny(text, KEYWORDS.phishing);
};

const isMerchantSettlementDelay = (input) => {
  const text = normalize(input && input.complaint);
  const history = getHistory(input);

  const settlementInHistory = historyHas(
    history,
    (t) => t && t.type === 'settlement',
  );
  const settlementInText = hasAny(text, KEYWORDS.settlement);

  // History-first: a settlement keyword without any settlement row in the
  // customer's history is not actionable — fall through to the next detector.
  if (!settlementInHistory) return false;

  return isMerchant(input) || settlementInText;
};

const isAgentCashInIssue = (input) => {
  const text = normalize(input && input.complaint);
  const history = getHistory(input);

  const cashInRows = findPendingOrFailedOfType(history, 'cash_in');
  const recentCompletedCashIn = findCompletedOfType(history, 'cash_in').filter(
    (t) => withinWindowFromLatest(history, t.timestamp, 24 * 60 * 60 * 1000),
  );
  const textMatches = hasAny(text, KEYWORDS.agent_cash_in);

  // Require a structural signal: a pending/failed cash_in, or a recent
  // completed cash_in that the customer is disputing.
  return textMatches && (cashInRows.length > 0 || recentCompletedCashIn.length > 0);
};

const isDuplicatePayment = (input) => {
  // History-first: a duplicate is only confirmed when two completed payments
  // share amount + counterparty within the window. A complaint alone saying
  // "charged twice" without twin rows in history is not actionable — fall
  // through to the next detector.
  return findDuplicatePair(getHistory(input)) !== null;
};

const isPaymentFailed = (input) => {
  const text = normalize(input && input.complaint);
  const history = getHistory(input);

  const failedPayments = findFailedOfType(history, 'payment');
  const textMatches = hasAny(text, KEYWORDS.payment_failed);

  if (!textMatches) return false;
  if (failedPayments.length === 0) return false;

  // Require the complaint to actually identify one of the failed payments —
  // either by amount or by counterparty. If only a generic "failed" complaint
  // is present with no identifying detail, fall through.
  const { amount, counterparty } = extractAmountAndCounterpartyFromComplaint(text);
  if (amount == null && !counterparty) {
    // No identifying detail — only fire if there is exactly one failed payment
    // and it is the most recent row in history.
    if (failedPayments.length !== 1) return false;
    const last = history[history.length - 1];
    return last && last.transaction_id === failedPayments[0].transaction_id;
  }

  return failedPayments.some(
    (t) =>
      (amount != null && t.amount === amount) ||
      (counterparty && counterpartyMatches(t.counterparty, counterparty)),
  );
};

const isWrongTransfer = (input) => {
  const text = normalize(input && input.complaint);
  const history = getHistory(input);

  const completedTransfers = findCompletedOfType(history, 'transfer');
  const textMatches = hasAny(text, KEYWORDS.wrong_transfer);

  if (!textMatches) return false;
  if (completedTransfers.length === 0) return false;

  const { amount, counterparty } = extractAmountAndCounterpartyFromComplaint(text);
  const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

  return completedTransfers.some((t) => {
    if (counterparty && counterpartyMatches(t.counterparty, counterparty)) {
      return true;
    }
    if (amount != null && t.amount === amount) {
      return withinWindowFromLatest(history, t.timestamp, RECENT_WINDOW_MS);
    }
    return false;
  });
};

const isRefundRequest = (input) => {
  const text = normalize(input && input.complaint);
  return hasAny(text, KEYWORDS.refund);
};

// Priority order: stronger/more-specific signals win over weaker ones.
const runDetectors = (input) => {
  if (isPhishing(input)) return 'phishing_or_social_engineering';
  if (isMerchantSettlementDelay(input)) return 'merchant_settlement_delay';
  if (isAgentCashInIssue(input)) return 'agent_cash_in_issue';
  if (isDuplicatePayment(input)) return 'duplicate_payment';
  if (isPaymentFailed(input)) return 'payment_failed';
  if (isWrongTransfer(input)) return 'wrong_transfer';
  if (isRefundRequest(input)) return 'refund_request';
  return 'other';
};

// ---------------------------------------------------------------------------
// Confidence scoring
//
// Each detector produces a score in [0, 1] reflecting how strongly its case
// type is supported by the input. The aggregator then combines per-detector
// scores with a priority ordering so the winning detector dominates.
//
// Rationale for the bands below:
//   - History-confirmed structural matches (duplicate_payment pair, failed
//     payment identified by amount/counterparty, etc.) are near-certain.
//   - History-confirmed matches on weaker signal (single keyword, no
//     identifying detail) are moderate.
//   - Text-only keyword matches without any history confirmation (phishing,
//     refund_request) are lower — the customer could be paraphrasing.
//
// The final output is clamped to [0.30, 0.95]. The floor of 0.30 prevents
// downstream code from treating an "other" classification as effectively zero
// confidence (which would be misread as "ignore"), and the ceiling of 0.95
// reserves the last 5% for human review since these are heuristic, not
// model-derived, probabilities.
// ---------------------------------------------------------------------------

const CONFIDENCE = {
  // Floors and ceilings
  MIN: 0.30,
  MAX: 0.95,
  // Per-detector base scores
  TEXT_ONLY_BASE: 0.55,        // keyword hit, no history confirmation
  STRUCTURAL_BASE: 0.75,       // history confirms the case type
  STRUCTURAL_STRONG: 0.85,     // history confirms with precise identifiers
  IDENTIFIER_BONUS: 0.05,      // amount or counterparty also identified
  MULTIPLE_HISTORY_BONUS: 0.05,// e.g. several prior transfers / multiple failures
  TEXT_KEYWORDS_BONUS: 0.03,   // text also contains matching keywords
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Score a single detector given the evidence it would use. Returns 0 if the
 * detector would have returned false (no signal at all).
 */
const scorePhishing = (input) => {
  if (!isPhishing(input)) return 0;
  // Phishing is text-only by design — we don't confirm phishing from history.
  let s = CONFIDENCE.TEXT_ONLY_BASE;
  // Multiple distinct phishing keywords strengthen the signal.
  const text = normalize(input && input.complaint);
  const hits = KEYWORDS.phishing.filter((k) => text.includes(k.toLowerCase())).length;
  if (hits >= 2) s += 0.05;
  if (hits >= 4) s += 0.05;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scoreMerchantSettlementDelay = (input) => {
  if (!isMerchantSettlementDelay(input)) return 0;
  let s = CONFIDENCE.STRUCTURAL_BASE;
  const history = getHistory(input);
  const settlementCount = findCompletedOfType(history, 'settlement').length
    + findPendingOrFailedOfType(history, 'settlement').length;
  if (settlementCount >= 1) s += CONFIDENCE.STRUCTURAL_STRONG - CONFIDENCE.STRUCTURAL_BASE;
  if (isMerchant(input)) s += CONFIDENCE.IDENTIFIER_BONUS;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scoreAgentCashInIssue = (input) => {
  if (!isAgentCashInIssue(input)) return 0;
  let s = CONFIDENCE.STRUCTURAL_BASE;
  const history = getHistory(input);
  const pendingFailed = findPendingOrFailedOfType(history, 'cash_in').length;
  const recent = findCompletedOfType(history, 'cash_in').filter((t) =>
    withinWindowFromLatest(history, t.timestamp, 24 * 60 * 60 * 1000),
  ).length;
  // A pending/failed cash_in is much stronger evidence than a disputed recent
  // completed one.
  if (pendingFailed > 0) s = CONFIDENCE.STRUCTURAL_STRONG;
  if (recent > 1) s += CONFIDENCE.MULTIPLE_HISTORY_BONUS;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scoreDuplicatePayment = (input) => {
  if (!isDuplicatePayment(input)) return 0;
  // findDuplicatePair is itself the structural proof.
  const pair = findDuplicatePair(getHistory(input));
  if (!pair) return CONFIDENCE.TEXT_ONLY_BASE;
  let s = CONFIDENCE.STRUCTURAL_STRONG;
  // If the customer also mentioned it in text, we have a structural AND
  // textual confirmation — very high confidence.
  const text = normalize(input && input.complaint);
  if (hasAny(text, KEYWORDS.duplicate_payment)) s += CONFIDENCE.TEXT_KEYWORDS_BONUS;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scorePaymentFailed = (input) => {
  if (!isPaymentFailed(input)) return 0;
  let s = CONFIDENCE.STRUCTURAL_BASE;
  const history = getHistory(input);
  const failedPayments = findFailedOfType(history, 'payment');
  const text = normalize(input && input.complaint);
  const { amount, counterparty } = extractAmountAndCounterpartyFromComplaint(text);
  if (amount != null || counterparty) s += CONFIDENCE.IDENTIFIER_BONUS;
  if (failedPayments.length > 1) s += CONFIDENCE.MULTIPLE_HISTORY_BONUS;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scoreWrongTransfer = (input) => {
  if (!isWrongTransfer(input)) return 0;
  let s = CONFIDENCE.STRUCTURAL_BASE;
  const history = getHistory(input);
  const completedTransfers = findCompletedOfType(history, 'transfer');
  const text = normalize(input && input.complaint);
  const { amount, counterparty } = extractAmountAndCounterpartyFromComplaint(text);
  if (amount != null || counterparty) s += CONFIDENCE.IDENTIFIER_BONUS;
  if (completedTransfers.length >= 3) s += CONFIDENCE.MULTIPLE_HISTORY_BONUS;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scoreRefundRequest = (input) => {
  if (!isRefundRequest(input)) return 0;
  // Refund is text-only — there's no history pattern that confirms a refund
  // request vs. a complaint about a non-refundable charge.
  let s = CONFIDENCE.TEXT_ONLY_BASE;
  const text = normalize(input && input.complaint);
  const hits = KEYWORDS.refund.filter((k) => text.includes(k.toLowerCase())).length;
  if (hits >= 2) s += 0.05;
  return clamp(s, CONFIDENCE.MIN, CONFIDENCE.MAX);
};

const scoreOther = () => CONFIDENCE.MIN;

/**
 * Detector order must mirror `runDetectors` — the first detector whose score
 * is > 0 wins, and its score becomes the headline confidence.
 */
const SCORED_DETECTORS = [
  ['phishing_or_social_engineering', scorePhishing],
  ['merchant_settlement_delay', scoreMerchantSettlementDelay],
  ['agent_cash_in_issue', scoreAgentCashInIssue],
  ['duplicate_payment', scoreDuplicatePayment],
  ['payment_failed', scorePaymentFailed],
  ['wrong_transfer', scoreWrongTransfer],
  ['refund_request', scoreRefundRequest],
];

const computeConfidence = (input) => {
  if (!input || typeof input !== 'object') return scoreOther();
  for (const [, score] of SCORED_DETECTORS) {
    const s = score(input);
    if (s > 0) return s;
  }
  return scoreOther();
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stable, machine-readable reason codes for a classified case. The controller
 * can attach these to the response so downstream consumers (audit, analytics)
 * can distinguish structural matches from text-only fallbacks.
 *
 * @param {string} caseType - result of `runDetectors`
 * @param {object} input - the original /analyze-ticket request body
 * @returns {string[]}
 */
const reasonCodesFor = (caseType, input) => {
  const text = normalize(input && input.complaint);
  const history = getHistory(input);
  const codes = [];
  const push = (code) => {
    if (code && !codes.includes(code)) codes.push(code);
  };

  switch (caseType) {
    case 'phishing_or_social_engineering': {
      push('phishing_keywords');
      push('text_only_fallback');
      break;
    }
    case 'merchant_settlement_delay': {
      push('settlement_in_history');
      if (isMerchant(input)) push('merchant_user_type');
      if (hasAny(text, KEYWORDS.settlement)) push('settlement_keywords');
      break;
    }
    case 'agent_cash_in_issue': {
      push('agent_cashin_keywords');
      if (findPendingOrFailedOfType(history, 'cash_in').length > 0) {
        push('cashin_pending_or_failed');
      } else {
        push('cashin_recent_completed');
      }
      break;
    }
    case 'duplicate_payment': {
      const pair = findDuplicatePair(history);
      if (pair) {
        push('duplicate_structural');
        push(`pair:${pair.first.transaction_id}+${pair.second.transaction_id}`);
      } else {
        push('duplicate_text_only');
        push('text_only_fallback');
      }
      break;
    }
    case 'payment_failed': {
      const failedPayments = findFailedOfType(history, 'payment');
      const { amount, counterparty } = extractAmountAndCounterpartyFromComplaint(text);
      if (amount != null) push(`amount:${amount}`);
      if (counterparty) push(`counterparty:${stripNonDigits(counterparty)}`);
      push(`failed_payments:${failedPayments.length}`);
      break;
    }
    case 'wrong_transfer': {
      const { amount, counterparty } = extractAmountAndCounterpartyFromComplaint(text);
      if (amount != null) push(`amount:${amount}`);
      if (counterparty) push(`counterparty:${stripNonDigits(counterparty)}`);
      push('completed_transfer_match');
      break;
    }
    case 'refund_request': {
      push('refund_keywords');
      push('text_only_fallback');
      break;
    }
    case 'other':
    default: {
      push('no_structural_match');
      break;
    }
  }

  return codes;
};

/**
 * Classify a ticket into one of the ALLOWED_ENUMS.case_type values.
 *
 * @param {object} input - The /analyze-ticket request body.
 * @param {string} input.ticket_id
 * @param {string} input.complaint
 * @param {string} [input.language]
 * @param {string} [input.channel]
 * @param {string} [input.user_type]
 * @param {string} [input.campaign_context]
 * @param {Array}  [input.transaction_history]
 * @returns {string} One of ALLOWED_ENUMS.case_type. Never throws — falls back
 *   to 'other' for malformed input so the controller can keep responding.
 */
const classifyTicket = (input) => {
  if (!input || typeof input !== 'object') return 'other';

  const result = runDetectors(input);

  // Defensive: guarantee we never return a value outside the enum, even if a
  // future detector accidentally returns an invalid string.
  return case_type_enum.includes(result) ? result : 'other';
};

/**
 * Classify a ticket and return a confidence score in [0.30, 0.95] alongside
 * the case type and the reason codes that justify the decision. The
 * confidence is derived from per-detector evidence (history confirmations,
 * identifier matches, multiple keyword hits) — see CONFIDENCE in this file
 * for the exact bands.
 *
 * @param {object} input - Same shape as `classifyTicket`.
 * @returns {{case_type: string, confidence: number, reason_codes: string[]}}
 *   Never throws — malformed input yields `{ case_type: 'other',
 *   confidence: 0.30, reason_codes: ['no_structural_match'] }`.
 */
const classifyTicketWithConfidence = (input) => {
  const case_type = classifyTicket(input);
  const classifyConfidence = computeConfidence(input);
  const reason_codes = reasonCodesFor(case_type, input || {});
  return { case_type, classifyConfidence, reason_codes };
};

module.exports = {
  classifyTicketWithConfidence,
  // Exported for tests; the controller only needs classifyTicket.
  _internal: {
    isPhishing,
    isMerchantSettlementDelay,
    isAgentCashInIssue,
    isDuplicatePayment,
    isPaymentFailed,
    isWrongTransfer,
    isRefundRequest,
    findDuplicatePair,
    findCompletedOfType,
    findFailedOfType,
    findPendingOrFailedOfType,
    extractAmountAndCounterpartyFromComplaint,
    reasonCodesFor,
    computeConfidence,
    CONFIDENCE,
  },
};