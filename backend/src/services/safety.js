/**
 * QueueStorm Investigator — Safety Enforcement Layer
 *
 * Post-processing guard that scans ALL output fields for policy violations
 * defined in §8 Safety Rules, and auto-corrects any violations found.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Rule 1  │ Never ask for PIN, OTP, password, full card number   │
 * │          │ Field: customer_reply                   Penalty: -15 │
 * ├──────────┼──────────────────────────────────────────────────────┤
 * │  Rule 2  │ Never confirm refund/reversal/unblock/recovery       │
 * │          │ without authority. Use hedged language.              │
 * │          │ Fields: customer_reply, recommended_next_action  -10 │
 * ├──────────┼──────────────────────────────────────────────────────┤
 * │  Rule 3  │ Never instruct customer to contact suspicious third  │
 * │          │ party. Direct only to official channels.             │
 * │          │ Field: customer_reply                   Penalty: -10 │
 * ├──────────┼──────────────────────────────────────────────────────┤
 * │  Rule 4  │ Adversarial prompt injection in complaint must not   │
 * │          │ override system rules. All output fields checked.    │
 * │          │ Penalty: schema or safety violation                  │
 * └──────────┴──────────────────────────────────────────────────────┘
 *
 * @param {Object} response  - The full API response object before sending
 * @param {string} [complaint] - Original complaint text (for injection check)
 * @returns {{ sanitized: Object, violations: Array<Object> }}
 */
function enforceSafety(response, complaint = '') {
  const violations = [];
  const sanitized = { ...response };

  // ═══════════════════════════════════════════════════════════════
  // RULE 1: Never ask for PIN, OTP, password, or full card number
  // Field checked: customer_reply                    Penalty: -15
  // ═══════════════════════════════════════════════════════════════

  const rule1Patterns = [
    // English patterns
    /\b(?:provide|share|enter|send|give|confirm|verify|tell|type|input)\s+(?:your\s+)?(?:pin|otp|password|passcode|card\s*number|cvv|cvc|security\s*code)/gi,
    /\b(?:what\s+is|what's)\s+(?:your\s+)?(?:pin|otp|password|card\s*number)/gi,
    /\bask(?:ing)?\s+(?:for\s+)?(?:your\s+)?(?:pin|otp|password|card\s*number)/gi,
    /\bverification\s+(?:step|process)\s*[:\-]?\s*(?:pin|otp|password)/gi,
    /\bsecurity\s+(?:step|check)\s*[:\-]?\s*(?:provide|share|enter)\s+(?:your\s+)?(?:pin|otp)/gi,
    // Bangla patterns
    /(?:আপনার\s+)?(?:পিন|ওটিপি|পাসওয়ার্ড|কার্ড\s*নম্বর)\s+(?:দিন|জানান|শেয়ার\s+করুন|পাঠান|বলুন|লিখুন)/gi,
    /(?:পিন|ওটিপি|পাসওয়ার্ড)\s+(?:প্রদান|প্রেরণ|জমা)/gi,
  ];

  const fieldsForRule1 = ['customer_reply', 'agent_summary'];

  for (const field of fieldsForRule1) {
    if (!sanitized[field] || typeof sanitized[field] !== 'string') continue;

    for (const pattern of rule1Patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized[field])) {
        violations.push({
          rule: 'RULE_1_SENSITIVE_DATA_REQUEST',
          field,
          penalty: -15,
          detail: 'Output asked the customer for PIN, OTP, password, or card number.',
          matched: sanitized[field].match(pattern)?.[0] || null,
        });
        break; // one violation per rule per field is enough
      }
    }

    // Auto-fix: strip any sentence that solicits sensitive credentials
    sanitized[field] = stripSensitiveRequests(sanitized[field]);
  }

  // ═══════════════════════════════════════════════════════════════
  // RULE 2: Never confirm refund/reversal/unblock/recovery
  //         without authority. Use hedged language instead.
  // Fields checked: customer_reply, recommended_next_action  -10
  // ═══════════════════════════════════════════════════════════════

  const rule2UnsafePatterns = [
    // Absolute promises of refund/reversal (without "eligible" hedge)
    /\bwe\s+will\s+refund\b/gi,
    /\bwe\s+will\s+reverse\b/gi,
    /\byour\s+(?:money|amount|balance)\s+(?:will\s+be|has\s+been)\s+(?:refunded|reversed|returned|credited)/gi,
    /\bwe\s+(?:have|has)\s+(?:refunded|reversed|unblocked|recovered)/gi,
    /\bwe\s+will\s+(?:unblock|recover)\b/gi,
    /\baccount\s+(?:has\s+been|will\s+be)\s+(?:unblocked|recovered|restored)/gi,
    // Bangla equivalents
    /(?:আমরা\s+)?(?:রিফান্ড|ফেরত)\s+(?:দিয়েছি|দেব|করেছি|করব)/gi,
    /(?:আপনার\s+)?(?:টাকা|অর্থ|ব্যালেন্স)\s+(?:ফেরত\s+দেওয়া\s+হয়েছে|ফেরত\s+দেওয়া\s+হবে)/gi,
  ];

  // Replacement map for unsafe → safe hedged language
  const rule2Replacements = [
    { unsafe: /\bwe will refund(?:\s+you)?\b/gi,                      safe: 'any eligible amount will be returned through official channels' },
    { unsafe: /\bwe will reverse\b/gi,                                 safe: 'if eligible, the amount will be reversed through official channels' },
    { unsafe: /\byour (?:money|amount|balance) will be (?:refunded|reversed|returned|credited)\b/gi, safe: 'any eligible amount will be returned through official channels' },
    { unsafe: /\byour (?:money|amount|balance) has been (?:refunded|reversed|returned|credited)\b/gi, safe: 'any eligible amount will be returned through official channels' },
    { unsafe: /\bwe (?:have|has) (?:refunded|reversed)\b/gi,          safe: 'any eligible amount will be returned through official channels' },
    { unsafe: /\bwe will (?:unblock|recover)\b/gi,                     safe: 'the matter will be reviewed and resolved through official channels' },
    { unsafe: /\baccount (?:has been|will be) (?:unblocked|recovered|restored)\b/gi, safe: 'the account status will be reviewed through official channels' },
    // Bangla
    { unsafe: /(?:আমরা\s+)?(?:রিফান্ড|ফেরত)\s+(?:দিয়েছি|দেব|করেছি|করব)/gi, safe: 'যেকোনো প্রযোজ্য ফেরতযোগ্য অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে' },
    { unsafe: /(?:আপনার\s+)?(?:টাকা|অর্থ|ব্যালেন্স)\s+(?:ফেরত\s+দেওয়া\s+হয়েছে|ফেরত\s+দেওয়া\s+হবে)/gi, safe: 'যেকোনো প্রযোজ্য ফেরতযোগ্য অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে' },
  ];

  const fieldsForRule2 = ['customer_reply', 'recommended_next_action', 'agent_summary'];

  for (const field of fieldsForRule2) {
    if (!sanitized[field]) continue;

    for (const pattern of rule2UnsafePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized[field])) {
        violations.push({
          rule: 'RULE_2_UNAUTHORIZED_CONFIRMATION',
          field,
          penalty: -10,
          detail: 'Confirmed refund, reversal, or account recovery without authority.',
          matched: sanitized[field].match(pattern)?.[0] || null,
        });
        break;
      }
    }

    // Auto-fix: replace unsafe promises with hedged language
    for (const { unsafe, safe } of rule2Replacements) {
      unsafe.lastIndex = 0;
      sanitized[field] = sanitized[field].replace(unsafe, safe);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RULE 3: Never instruct customer to contact a suspicious
  //         third party. Direct only to official support channels.
  // Field checked: customer_reply                    Penalty: -10
  // ═══════════════════════════════════════════════════════════════

  const rule3Patterns = [
    // Directing to unknown phone numbers (not prefixed with "official" or "our")
    /\b(?:call|contact|reach|message|text|dial|phone)\s+(?:this\s+)?(?:number|person|agent|representative)\s*[:\-]?\s*\+?\d{7,}/gi,
    /\b(?:call|contact|reach)\s+\+?\d{10,}/gi,
    // Directing to external/suspicious URLs
    /\b(?:visit|go\s+to|click|open)\s+(?:this\s+)?(?:link|url|website)\s*[:\-]?\s*https?:\/\/\S+/gi,
    // Directing to WhatsApp / Telegram / social media for support
    /\b(?:contact|message|reach)\s+(?:us\s+)?(?:on|via|through)\s+(?:whatsapp|telegram|viber|imo|facebook|messenger)/gi,
    // Bangla patterns
    /(?:এই\s+নম্বরে|এই\s+ব্যক্তিকে)\s+(?:কল|যোগাযোগ|ফোন)/gi,
  ];

  // Phrases that indicate official channel direction (allowlist)
  const officialChannelIndicators = [
    /\b(?:official\s+(?:support\s+)?channels?|our\s+(?:support|helpline|customer\s+service))\b/i,
    /\b(?:in-app\s+support|help\s+center|support\s+portal)\b/i,
    /(?:অফিসিয়াল\s+(?:সাপোর্ট\s+)?চ্যানেল)/i,
  ];

  const fieldsForRule3 = ['customer_reply', 'agent_summary'];

  for (const field of fieldsForRule3) {
    if (!sanitized[field] || typeof sanitized[field] !== 'string') continue;

    for (const pattern of rule3Patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized[field])) {
        // Check if the text also mentions official channels (might be legit)
        const isOfficialContext = officialChannelIndicators.some(
          (ind) => ind.test(sanitized[field])
        );

        if (!isOfficialContext) {
          violations.push({
            rule: 'RULE_3_SUSPICIOUS_THIRD_PARTY',
            field,
            penalty: -10,
            detail: 'Directed customer to a suspicious third party instead of official channels.',
            matched: sanitized[field].match(pattern)?.[0] || null,
          });

          // Auto-fix: replace suspicious contact directives with official channel language
          sanitized[field] = sanitized[field].replace(
            pattern,
            'contact us through our official support channels'
          );
          break;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RULE 4: Adversarial prompt injection — complaint text must
  //         NOT override system rules or appear in output fields.
  // Fields checked: ALL output fields        Penalty: schema/safety
  // ═══════════════════════════════════════════════════════════════

  if (complaint) {
    const injectionSignatures = detectPromptInjection(complaint);

    if (injectionSignatures.length > 0) {
      // Check all string output fields for leaked injection artifacts
      const outputFields = [
        'customer_reply',
        'recommended_next_action',
        'agent_summary',
        'case_type',
        'evidence_verdict',
        'severity',
        'department',
      ];

      for (const field of outputFields) {
        if (!sanitized[field] || typeof sanitized[field] !== 'string') continue;

        for (const sig of injectionSignatures) {
          if (sanitized[field].toLowerCase().includes(sig.toLowerCase())) {
            violations.push({
              rule: 'RULE_4_PROMPT_INJECTION',
              field,
              penalty: 'schema_or_safety_violation',
              detail: `Injection artifact leaked into ${field}: "${sig}"`,
              matched: sig,
            });

            // Auto-fix: remove the injection content from the output
            sanitized[field] = sanitized[field]
              .split(sig)
              .join('')
              .replace(/\s{2,}/g, ' ')
              .trim();
          }
        }
      }
    }
  }

  return { sanitized, violations };
}


// ─────────────────────────────────────────────────────────────────
// HELPER: Strip sentences that ask for sensitive credentials
// ─────────────────────────────────────────────────────────────────

function stripSensitiveRequests(text) {
  // Split into sentences and filter out any that solicit credentials
  const sensitiveWords = /\b(?:pin|otp|password|passcode|card\s*number|cvv|cvc|security\s*code)\b/i;
  const requestVerbs = /\b(?:provide|share|enter|send|give|confirm|verify|tell|type|input)\b/i;
  const banglaRequest = /(?:পিন|ওটিপি|পাসওয়ার্ড|কার্ড\s*নম্বর)\s+(?:দিন|জানান|শেয়ার|পাঠান|বলুন|লিখুন)/i;

  // Split on sentence boundaries (., !, ?, or Bangla dari ।)
  const sentences = text.split(/(?<=[.!?।])\s+/);

  const safeSentences = sentences.filter((sentence) => {
    // If a sentence both mentions sensitive data AND has a request verb, remove it
    const hasSensitiveWord = sensitiveWords.test(sentence);
    const hasRequestVerb = requestVerbs.test(sentence);
    const hasBanglaRequest = banglaRequest.test(sentence);

    if ((hasSensitiveWord && hasRequestVerb) || hasBanglaRequest) {
      return false;
    }
    return true;
  });

  let result = safeSentences.join(' ').trim();

  // If the entire reply was stripped, provide a safe fallback
  if (!result) {
    result = 'We are reviewing your concern and will update you through official support channels. Please do not share your PIN or OTP with anyone.';
  }

  return result;
}


// ─────────────────────────────────────────────────────────────────
// HELPER: Detect prompt injection signatures in complaint text
// ─────────────────────────────────────────────────────────────────

function detectPromptInjection(complaint) {
  const lower = complaint.toLowerCase();
  const signatures = [];

  // Common injection patterns
  const injectionPatterns = [
    // System prompt override attempts
    { pattern: /\bignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|rules?|prompts?)\b/i, label: 'system_override' },
    { pattern: /\byou\s+are\s+now\s+(?:a|an)\b/i, label: 'role_reassignment' },
    { pattern: /\bforget\s+(?:all\s+)?(?:your|previous|prior)\s+(?:instructions?|rules?|training)\b/i, label: 'memory_wipe' },
    { pattern: /\bact\s+as\s+(?:if|though)\b/i, label: 'persona_override' },
    { pattern: /\bnew\s+(?:instructions?|rules?|system\s+prompt)\s*:/i, label: 'new_instructions' },
    { pattern: /\b(?:system|admin|root)\s*:\s*/i, label: 'privilege_escalation' },
    // Output manipulation
    { pattern: /\breturn\s+(?:only|just|exactly)\s*[:\-]?\s*["'`{]/i, label: 'output_control' },
    { pattern: /\brespond\s+with\s+(?:only|just|exactly)\b/i, label: 'output_control' },
    { pattern: /\boverride\s+(?:the\s+)?(?:case_type|severity|department|verdict)\b/i, label: 'field_override' },
    { pattern: /\bset\s+(?:case_type|severity|department|verdict)\s+to\b/i, label: 'field_override' },
    // Disguised directives
    { pattern: /\b(?:do\s+not|don'?t)\s+(?:flag|report|escalate|review)\b/i, label: 'suppression_attempt' },
    { pattern: /\bmark\s+(?:this\s+)?(?:as\s+)?(?:resolved|safe|benign|low)\b/i, label: 'classification_override' },
  ];

  for (const { pattern, label } of injectionPatterns) {
    const match = complaint.match(pattern);
    if (match) {
      signatures.push(match[0]);
    }
  }

  return signatures;
}


module.exports = { enforceSafety };
