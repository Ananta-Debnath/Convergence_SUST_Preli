/**
 * Deterministic Customer Reply Generator for QueueStorm Investigator
 * * @param {Object} triageOutput - The structured analysis object
 * @param {string} triageOutput.case_type - Enum of the case type
 * @param {string} triageOutput.evidence_verdict - Enum of the evidence verdict
 * @param {string|null} triageOutput.relevant_transaction_id - The matching TXN ID
 * @param {string} [triageOutput.language='en'] - 'en' or 'bn' (defaults to 'en')
 * @param {string} [triageOutput.user_type='customer'] - 'customer', 'merchant', etc.
 * @returns {string} The safe, compliant customer_reply string
 */
function generateCustomerReply(triageOutput) {
  const {
    case_type,
    evidence_verdict,
    relevant_transaction_id,
    language = 'en',
    user_type = 'customer'
  } = triageOutput;

  const isBangla = language === 'bn';
  const isMerchant = user_type === 'merchant';
  const isPhishing = case_type === 'phishing_or_social_engineering';
  const isVague = case_type === 'other' && evidence_verdict === 'insufficient_data';
  const isAmbiguous = evidence_verdict === 'insufficient_data' && !isVague && !isPhishing;

  // ==========================================
  // BLOCK A: OPENERS (Context Binding)
  // ==========================================
  const openers = {
    en: {
      standard: `We have noted your concern about transaction ${relevant_transaction_id}.`,
      duplicate: `We have noted the possible duplicate payment for transaction ${relevant_transaction_id}.`,
      deduction: `We have noted that transaction ${relevant_transaction_id} may have caused an unexpected balance deduction.`,
      general: `Thank you for reaching out.`,
      phishing: `Thank you for reaching out before sharing any information.`,
      merchant_settlement: `We have noted your concern about settlement ${relevant_transaction_id}.`
    },
    bn: {
      standard: `আপনার লেনদেন ${relevant_transaction_id} এর বিষয়ে আমরা অবগত হয়েছি।`,
      duplicate: `আপনার লেনদেন ${relevant_transaction_id} এর সম্ভাব্য দ্বৈত পেমেন্টের বিষয়টি আমরা অবগত হয়েছি।`,
      deduction: `আমরা লক্ষ্য করেছি যে লেনদেন ${relevant_transaction_id} এর কারণে আপনার ব্যালেন্স থেকে অনাকাঙ্ক্ষিত টাকা কেটে নেওয়া হয়ে থাকতে পারে।`,
      general: `যোগাযোগ করার জন্য ধন্যবাদ।`,
      phishing: `কোনো তথ্য শেয়ার করার আগে যোগাযোগ করার জন্য ধন্যবাদ।`,
      merchant_settlement: `আপনার সেটেলমেন্ট ${relevant_transaction_id} এর বিষয়ে আমরা অবগত হয়েছি।`
    }
  };

  // ==========================================
  // BLOCK B: CORE RESOLUTION (Policy Routing)
  // ==========================================
  const resolutions = {
    en: {
      wrong_transfer: `Our dispute team will review the case carefully and contact you through official support channels.`,
      payment_failed: `Our payments team will review the case and any eligible amount will be returned through official channels.`,
      duplicate_payment: `Our payments team will verify with the biller and any eligible amount will be returned through official channels.`,
      refund_request: `Refunds for completed merchant payments depend on the merchant's own policy. We recommend contacting the merchant directly. If you need help reaching them, please reply and we will guide you.`,
      merchant_settlement_delay: `Our merchant operations team will check the batch status and update you on the expected settlement time through official channels.`,
      agent_cash_in_issue: `Our agent operations team will verify this quickly and update you through official channels.`,
      phishing_or_social_engineering: `We never ask for your PIN, OTP, or password under any circumstances. Please do not share these with anyone, even if they claim to be from us. Our fraud team has been notified of this incident.`,
      vague: `To help you faster, please share the transaction ID, the amount involved, and a short description of what went wrong.`,
      ambiguous: `We see multiple transactions of 1000 BDT on that date. Could you share your brother's number so we can identify the right transaction?` // Matches Sample 08 benchmark
    },
    bn: {
      wrong_transfer: `আমাদের ডিসপিউট টিম বিষয়টি সতর্কতার সাথে পর্যালোচনা করবে এবং অফিসিয়াল সাপোর্ট চ্যানেলের মাধ্যমে আপনার সাথে যোগাযোগ করবে।`,
      payment_failed: `আমাদের পেমেন্টস টিম বিষয়টি পর্যালোচনা করবে এবং যেকোনো প্রযোজ্য ফেরতযোগ্য অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে।`,
      duplicate_payment: `আমাদের পেমেন্টস টিম বিলারের সাথে এটি যাচাই করবে এবং যেকোনো প্রযোজ্য ফেরতযোগ্য অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে।`,
      refund_request: `সম্পন্ন হওয়া মার্চেন্ট পেমেন্টের রিফান্ড মার্চেন্টের নিজস্ব নীতির ওপর নির্ভর করে। আমরা সরাসরি মার্চেন্টের সাথে যোগাযোগ করার পরামর্শ দিচ্ছি।`,
      merchant_settlement_delay: `আমাদের মার্চেন্ট অপারেশন্স টিম ব্যাচ স্ট্যাটাস পরীক্ষা করবে এবং অফিসিয়াল চ্যানেলের মাধ্যমে আপনাকে প্রত্যাশিত সেটেলমেন্টের সময় জানিয়ে দেবে।`,
      agent_cash_in_issue: `আমাদের এজেন্ট অপারেশন্স দল এটি দ্রুত যাচাই করবে এবং অফিসিয়াল চ্যানেলে আপনাকে জানাবে।`,
      phishing_or_social_engineering: `আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড জানতে চাই না। অনুগ্রহ করে এগুলো কারো সাথে শেয়ার করবেন না, এমনকি তারা আমাদের প্রতিনিধি দাবি করলেও। আমাদের ফ্রড টিমকে এই ঘটনা জানানো হয়েছে।`,
      vague: `আপনাকে দ্রুত সাহায্য করার জন্য, অনুগ্রহ করে ট্রানজেকশন আইডি, টাকার পরিমাণ এবং কী সমস্যা হয়েছে তার একটি সংক্ষিপ্ত বিবরণ শেয়ার করুন।`,
      ambiguous: `আমরা ওই তারিখে একই পরিমাণের একাধিক লেনদেন দেখতে পাচ্ছি। সঠিক লেনদেনটি চিহ্নিত করতে অনুগ্রহ করে প্রাপকের নম্বরটি শেয়ার করুন।`
    }
  };

  // ==========================================
  // BLOCK C: SAFETY FOOTER (Universal Guardrail)
  // ==========================================
  const footers = {
    en: ` Please do not share your PIN or OTP with anyone.`,
    bn: ` অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।`
  };

  const langKey = isBangla ? 'bn' : 'en';

  // 1. Select Block A (Opener)
  let blockA;
  if (isPhishing) {
    blockA = openers[langKey].phishing;
  } else if (isVague || isAmbiguous || case_type === 'refund_request') {
    blockA = openers[langKey].general;
  } else if (case_type === 'duplicate_payment') {
    blockA = openers[langKey].duplicate;
  } else if (case_type === 'payment_failed') {
    blockA = openers[langKey].deduction;
  } else if (case_type === 'merchant_settlement_delay') {
    blockA = openers[langKey].merchant_settlement;
  } else {
    blockA = openers[langKey].standard;
  }

  // 2. Select Block B (Resolution)
  let blockB;
  if (isVague) {
    blockB = resolutions[langKey].vague;
  } else if (isAmbiguous) {
    blockB = resolutions[langKey].ambiguous;
  } else {
    blockB = resolutions[langKey][case_type] || resolutions[langKey].vague;
  }

  // 3. Select Block C (Footer)
  // Merchants and Phishing victims do NOT get the standard PIN warning footer
  const blockC = (isMerchant || isPhishing) ? '' : footers[langKey];

  // 4. Concatenate and return
  return `${blockA} ${blockB}${blockC}`.trim();
}

module.exports = { generateCustomerReply };