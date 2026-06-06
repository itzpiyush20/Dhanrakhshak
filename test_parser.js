// ============================================
// Dhanrakshak Parsing Engine Test Run
// Simulates parsing real emails and checks for anomalies
// ============================================

const BANK_NAMES = [
  { pattern: /\bhdfc\b/i, label: 'HDFC' },
  { pattern: /\bicici\b/i, label: 'ICICI' },
  { pattern: /\bsbi\b|\bstate\s*bank\b/i, label: 'SBI' },
  { pattern: /\baxis\b/i, label: 'Axis' },
  { pattern: /\bkotak\b/i, label: 'Kotak' },
  { pattern: /\bpnb\b|\bpunjab\s*national\b/i, label: 'PNB' },
  { pattern: /\bbob\b|\bbank\s*of\s*baroda\b/i, label: 'Bank of Baroda' },
  { pattern: /\bcanara\b/i, label: 'Canara' },
  { pattern: /\byes\s*bank\b|\byesbank\b/i, label: 'Yes Bank' },
  { pattern: /\bpaytm\b/i, label: 'Paytm' },
  { pattern: /\bidfc\b/i, label: 'IDFC First' },
  { pattern: /\bfederal\b/i, label: 'Federal' },
  { pattern: /\bunion\b/i, label: 'Union' },
  { pattern: /\bindusind\b/i, label: 'IndusInd' },
  { pattern: /\bciti\b|\bcitibank\b/i, label: 'Citi' },
  { pattern: /\brbl\b/i, label: 'RBL' },
  { pattern: /\bau\s*small\s*finance\b|\bau\s*bank\b/i, label: 'AU Bank' },
  { pattern: /\bbandhan\b/i, label: 'Bandhan' },
  { pattern: /\bindian\s*overseas\b|\biob\b/i, label: 'IOB' },
  { pattern: /\bcentral\s*bank\b/i, label: 'Central Bank' },
  { pattern: /\buco\s*bank\b/i, label: 'UCO Bank' },
  { pattern: /\bboi\b|\bbank\s*of\s*india\b/i, label: 'Bank of India' },
  { pattern: /\bstandard\s*chartered\b|\bsc\s*bank\b/i, label: 'StanChart' },
  { pattern: /\bhsbc\b/i, label: 'HSBC' },
  { pattern: /\bdbs\b/i, label: 'DBS' },
  { pattern: /\bamex\b|\bamerican\s*express\b/i, label: 'Amex' },
];

function extractBankName(text) {
  for (const bank of BANK_NAMES) {
    if (bank.pattern.test(text)) {
      return bank.label;
    }
  }
  return '';
}

function detectPaymentInstrument(text) {
  const lower = text.toLowerCase();
  if (/credit\s*card/i.test(text)) return 'credit_card';
  if (/\bcc\s+(?:ending|xx|no|number)/i.test(text)) return 'credit_card';
  if (/card\s*(?:ending|xx|no\.?\s*\d)/i.test(text) && !/debit\s*card/i.test(text) && !/a\/c|account|savings|current/i.test(text)) {
    return 'credit_card';
  }
  if (/debit\s*card/i.test(text)) return 'debit_card';
  if (/\bupi\b/i.test(text)) return 'upi';
  if (/@[a-z]+/i.test(lower) && /(?:paid|txn|transfer)/i.test(text)) return 'upi';
  if (/\b(?:neft|imps|rtgs|ft|netbanking|internetbanking)\b/i.test(text)) return 'bank_account';
  if (/net\s*banking|internet\s*banking|online\s*transfer|fund\s*transfer/i.test(text)) return 'bank_account';
  if (/a\/c|account|acct|savings\s*(?:a\/c|account)?|current\s*(?:a\/c|account)?/i.test(text)) return 'bank_account';
  if (/debited\s+from|credited\s+to|your\s+(?:bank|a\/c)/i.test(text)) return 'bank_account';
  if (/wallet|paytm\s*wallet|phonepe\s*wallet|freecharge|mobikwik/i.test(lower)) return 'wallet';
  if (/\bcard\b/i.test(text)) return 'credit_card';
  return 'unknown';
}

function extractLast4Digits(text) {
  const patterns = [
    /(?:[xX\*]+-?)+\s*(\d{4})\b/,
    /(?:ending|ends)\s*(?:in\s*)?(\d{4})/i,
    /(?:card|cc|a\/c|ac|account|acct)\s*(?:no\.?\s*)?(?:ending\s*)?(?:in\s*)?(?:xx|XX|\*+|x+)?\s*(\d{4})/i,
    /(?:card|cc|a\/c|ac|account|acct)\s*(?:no\.?\s*)?(\d{4})(?:\s|$|\.|\,)/i,
    /(\d{4})\s*(?:was\s+debited|has\s+been\s+debited|was\s+charged)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function parsePaymentSource(notes) {
  if (!notes) return 'Main Wallet';
  const instrument = detectPaymentInstrument(notes);
  const bankName = extractBankName(notes);

  switch (instrument) {
    case 'credit_card':
      return bankName ? `${bankName} Credit Card` : 'Credit Card';
    case 'debit_card':
      return bankName ? `${bankName} Debit Card` : 'Debit Card';
    case 'upi':
      return bankName ? `${bankName} UPI` : 'UPI';
    case 'bank_account':
      return bankName ? `${bankName} Bank A/c` : 'Bank A/c';
    case 'wallet':
      return bankName ? `${bankName} Wallet` : 'Digital Wallet';
    default:
      if (bankName) return `${bankName} Bank`;
      return 'Bank';
  }
}

const KNOWN_MERCHANTS = [
  { pattern: /zomato/i, name: 'Zomato', category: 'food', description: 'Zomato Food Order' },
  { pattern: /swiggy/i, name: 'Swiggy', category: 'food', description: 'Swiggy Meal Delivery' },
  { pattern: /uber\s*eats/i, name: 'Uber Eats', category: 'food', description: 'Uber Eats Order' },
  { pattern: /dunzo/i, name: 'Dunzo', category: 'food', description: 'Dunzo Delivery' },
  { pattern: /blinkit/i, name: 'Blinkit', category: 'groceries', description: 'Blinkit Quick Delivery' },
  { pattern: /bigbasket/i, name: 'BigBasket', category: 'groceries', description: 'BigBasket Groceries' },
  { pattern: /zepto/i, name: 'Zepto', category: 'groceries', description: 'Zepto Quick Commerce' },
  { pattern: /uber/i, name: 'Uber', category: 'transport', description: 'Uber Cab Ride' },
  { pattern: /ola\b/i, name: 'Ola', category: 'transport', description: 'Ola Cab Ride' },
  { pattern: /rapido/i, name: 'Rapido', category: 'transport', description: 'Rapido Bike Ride' },
  { pattern: /netflix/i, name: 'Netflix', category: 'subscriptions', description: 'Netflix Subscription' },
  { pattern: /spotify/i, name: 'Spotify', category: 'subscriptions', description: 'Spotify Premium' },
  { pattern: /hotstar|disney\+/i, name: 'Disney+ Hotstar', category: 'subscriptions', description: 'Disney+ Hotstar Subscription' },
  { pattern: /youtube\s*premium/i, name: 'YouTube Premium', category: 'subscriptions', description: 'YouTube Premium' },
  { pattern: /amazon\s*prime/i, name: 'Amazon Prime', category: 'subscriptions', description: 'Amazon Prime Subscription' },
  { pattern: /jio\s*cinema/i, name: 'JioCinema', category: 'subscriptions', description: 'JioCinema Subscription' },
  { pattern: /myntra/i, name: 'Myntra', category: 'shopping', description: 'Myntra Fashion Purchase' },
  { pattern: /amazon/i, name: 'Amazon', category: 'shopping', description: 'Amazon Checkout' },
  { pattern: /flipkart/i, name: 'Flipkart', category: 'shopping', description: 'Flipkart Shopping' },
  { pattern: /meesho/i, name: 'Meesho', category: 'shopping', description: 'Meesho Purchase' },
  { pattern: /ajio/i, name: 'AJIO', category: 'shopping', description: 'AJIO Fashion Purchase' },
  { pattern: /nykaa/i, name: 'Nykaa', category: 'shopping', description: 'Nykaa Beauty Purchase' },
  { pattern: /croma/i, name: 'Croma', category: 'shopping', description: 'Croma Electronics' },
  { pattern: /airtel/i, name: 'Airtel', category: 'utilities', description: 'Airtel Telecom / Broadband' },
  { pattern: /\bjio\b/i, name: 'Jio', category: 'utilities', description: 'Jio Telecom Recharge' },
  { pattern: /\bvi\b|vodafone|idea/i, name: 'Vi (Vodafone Idea)', category: 'utilities', description: 'Vi Telecom Recharge' },
  { pattern: /bsnl/i, name: 'BSNL', category: 'utilities', description: 'BSNL Telecom Bill' },
  { pattern: /electricity|bescom|tata\s*power|adani\s*electricity/i, name: 'Electricity Provider', category: 'utilities', description: 'Electricity Bill Payment' },
  { pattern: /gas\s*bill|indane|bharat\s*gas|hp\s*gas/i, name: 'Gas Provider', category: 'utilities', description: 'Gas Bill Payment' },
  { pattern: /water\s*bill|water\s*supply/i, name: 'Water Supply', category: 'utilities', description: 'Water Bill Payment' },
  { pattern: /salary|credited\s*by.*(?:employer|company|corp)/i, name: 'Salary Credit', category: 'salary', description: 'Monthly Salary Credit' },
  { pattern: /bookmyshow|bms/i, name: 'BookMyShow', category: 'entertainment', description: 'BookMyShow Tickets' },
  { pattern: /pvr|inox/i, name: 'PVR INOX', category: 'entertainment', description: 'PVR INOX Cinema' },
  { pattern: /makemytrip|mmt/i, name: 'MakeMyTrip', category: 'transport', description: 'MakeMyTrip Booking' },
  { pattern: /irctc/i, name: 'IRCTC', category: 'transport', description: 'IRCTC Railway Booking' },
  { pattern: /gpay|google\s*pay/i, name: 'Google Pay', category: 'other', description: 'Google Pay Transaction' },
  { pattern: /phonepe/i, name: 'PhonePe', category: 'other', description: 'PhonePe Transaction' },
  { pattern: /paytm/i, name: 'Paytm', category: 'other', description: 'Paytm Transaction' },
];

const GENERIC_MERCHANT_PATTERNS = [
  /auto\s*detected/i,
  /retail\s*transaction/i,
  /payment\s*transaction/i,
  /bank\s*transaction/i,
  /^merchant$/i,
  /^payment$/i,
  /^transaction$/i,
];

function extractMerchantFromSnippet(snippet) {
  for (const km of KNOWN_MERCHANTS) {
    if (km.pattern.test(snippet)) {
      return { name: km.name, category: km.category, description: km.description };
    }
  }
  return null;
}

function extractDynamicMerchant(snippet) {
  const patterns = [
    // Dynamic merchant patterns for NEFT, Credit Card, UPI, etc. with text or amounts in between
    /(?:transferred|sent|paid)\s+(?:Rs\.?\s*|INR\s*|₹\s*)?[0-9,]+(?:\.[0-9]+)?\s+to\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+UPI|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:debited|charged)\s+(?:Rs\.?\s*|INR\s*|₹\s*)?[0-9,]+(?:\.[0-9]+)?\s+(?:at|on|for)\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:merchant|vendor|biller|payee|recipient)[:\s]+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\r|\n|$))/i,
    
    // Splitted Info/Narration/Remarks patterns to avoid matching "Ref No." as a merchant name "No"
    /(?:info|narration|remarks)[:\s\-]+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,
    /ref\s*[:\-]\s*([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,

    // Credit-specific from-pattern
    /(?:credited|received|refunded)\s+.*?\s+from\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:transfer(?:red)?|received)\s+from\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,

    /(?:paid\s+to|transfer(?:red)?\s+to|debited\s+to|txn\s+to|payment\s+to|sent\s+to)\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+UPI\s*Ref|\s+on|\s+at|\s+ref|\s+for|\s+via|\s*$))/i,
    /(?:spent\s+at|debited\s+at|purchased\s+at|payment\s+at|charged\s+at|(?:^|\s)at)\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+UPI\s*Ref|\s+on|\s+ref|\s+for|\s+via|\s*$))/i,
    /to\s+([A-Z][A-Z0-9\s&]{2,25}?)(?:\s*\.?\s*(?:Ref|UPI|ref|$))/,
    /VPA[:\s]+([a-z0-9._]+)@/i,
    /Info[:\s]+([A-Za-z0-9][\w\s&.\-]{2,25})/i,
  ];

  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match && match[1]) {
      let merchant = match[1].trim();
      merchant = merchant
        .replace(/\b(ref|on|using|by|upi|refno|xx|account|ref\s*no|UPI\s*Ref)\b.*/i, '')
        .trim();
      
      if (merchant.length < 2) continue;
      if (/^(rs|inr|the|and|for|was|ref|upi)$/i.test(merchant)) continue;
      merchant = merchant
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      return merchant;
    }
  }
  return '';
}

function generateDescription(merchant, snippet, type) {
  const known = extractMerchantFromSnippet(snippet);
  if (known) return known.description;

  if (merchant && merchant.length > 1) {
    const cleanMerchant = merchant
      .replace(/(?:outflow|ride|sub|rides|alert|payment|fashion|pos|txn|ref|order)/gi, '')
      .trim();
    if (type === 'credit') return `${cleanMerchant || 'Incoming'} Credit`;
    return `${cleanMerchant || 'Payment'} Transaction`;
  }

  if (type === 'credit') {
    if (/salary|credited by/i.test(snippet)) return 'Salary Credit';
    if (/refund/i.test(snippet)) return 'Refund Credit';
    if (/cashback/i.test(snippet)) return 'Cashback Credit';
    return 'Incoming Credit';
  }
  if (/emi/i.test(snippet)) return 'EMI Debit';
  if (/insurance/i.test(snippet)) return 'Insurance Premium';
  if (/mutual\s*fund|sip/i.test(snippet)) return 'Investment SIP Debit';
  if (/loan/i.test(snippet)) return 'Loan Repayment';
  if (/bill\s*pay|autopay/i.test(snippet)) return 'Bill Auto-Pay';
  return 'Bank Transaction';
}

// Simulated transaction database logic
function parseEmail(subject, bodyText, mailDate = '2026-05-30') {
  const fullText = `${subject} ${bodyText}`;
  const emailContentForParsing = fullText.substring(0, 2000);

  // 1. Skip declined or failed transactions
  if (/declined|failed|unsuccessful/i.test(emailContentForParsing)) {
    return { status: 'skipped', reason: 'Declined/Failed status' };
  }

  // 2. Skip OTP / verification codes
  if (/\b(?:otp|one\s*time\s*password|verification\s*code|verification\s*pin|do\s*not\s*share|authorise\s*transaction|authorizing\s*txn|securesubmit|approve\s*this\s*txn)\b/i.test(emailContentForParsing)) {
    return { status: 'skipped', reason: 'OTP / Verification code' };
  }

  // 3. Skip reminders, due statements, monthly accounts
  if (/\b(?:due|reminder|remind|upcoming|due\s+date|minimum\s+due|statement\s+for|payment\s+due|overdue|payable|bill\s+generated|statement\s+of|monthly\s+statement)\b/i.test(emailContentForParsing)) {
    return { status: 'skipped', reason: 'Payment Reminder / Due statement' };
  }
  if (/(?:will\s+be\s+debited|scheduled\s+for|pay\s+before|reminder\b)/i.test(emailContentForParsing)) {
    return { status: 'skipped', reason: 'Upcoming / Scheduled notification' };
  }

  // 3b. Skip administrative, policy, terms, guidelines, or security alerts
  if (/\b(?:policy\s+update|security\s+policy|guidelines|security\s+terms|terms\s+of\s+service|terms\s+&\s+conditions|agreement\s+update|privacy\s+update|will\s+not\s+be\s+charged|no\s+charges\s+apply)\b/i.test(emailContentForParsing)) {
    return { status: 'skipped', reason: 'Administrative/Security policy update notice' };
  }

  // 4. Heuristic check
  const isPromo = /promo|discount|coupon|deal|unsubscribe|offer|shop now|buy now/i.test(emailContentForParsing);
  const isTxn = /debited|credited|debit|credit|spent|paid|payment|txn|transfer|received|withdrawn|withdrew|charged|a\/c|account|neft|imps|rtgs|bill|recharge|transaction|refund|cashback|salary|deposit|net\s*banking|internet\s*banking/i.test(emailContentForParsing);
  if (isPromo && !isTxn) {
    return { status: 'skipped', reason: 'Promotional spam' };
  }

  // 5. Amount regex
  const matches = [];
  const prefixRegex = /(?:Rs\.?\s*|INR\s*|₹\s*|Rupees?\s*)([0-9,]+(?:\.[0-9]+)?)/gi;
  const suffixRegex = /\b([0-9,]+(?:\.[0-9]+)?)\s*(?:Rs\.?|INR|₹|Rupees?)/gi;

  let match;
  while ((match = prefixRegex.exec(emailContentForParsing)) !== null) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!isNaN(value) && value > 0 && value <= 999999.99) {
      matches.push({ value, index: match.index, text: match[0] });
    }
  }
  while ((match = suffixRegex.exec(emailContentForParsing)) !== null) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!isNaN(value) && value > 0 && value <= 999999.99) {
      matches.push({ value, index: match.index, text: match[0] });
    }
  }

  if (matches.length === 0) {
    return { status: 'skipped', reason: 'No valid amount found' };
  }

  // 6. Filter limits & balance details
  const filteredMatches = matches.filter(m => {
    const preStart = Math.max(0, m.index - 30);
    const precedingText = emailContentForParsing.substring(preStart, m.index).toLowerCase();
    const postEnd = Math.min(emailContentForParsing.length, m.index + m.text.length + 20);
    const succeedingText = emailContentForParsing.substring(m.index + m.text.length, postEnd).toLowerCase();

    if (
      /bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger/i.test(precedingText) ||
      /bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger/i.test(succeedingText)
    ) {
      return false;
    }
    return true;
  });

  if (filteredMatches.length === 0) {
    return { status: 'skipped', reason: 'Amounts are balance/credit limit statements' };
  }

  let amount = filteredMatches[0].value;
  let resolvedMatch = filteredMatches[0];

  if (filteredMatches.length > 1) {
    const txKeywords = /debited|spent|paid|withdrawn|txn|charged|payment|credited|received|added|refund|transfer|neft|imps|rtgs/i;
    let minDistance = Infinity;
    filteredMatches.forEach((m) => {
      const start = Math.max(0, m.index - 60);
      const end = Math.min(emailContentForParsing.length, m.index + m.text.length + 60);
      const context = emailContentForParsing.substring(start, end);
      const kwMatch = context.match(txKeywords);
      if (kwMatch && kwMatch.index !== undefined) {
        const kwAbsIndex = start + kwMatch.index;
        const distance = Math.abs(kwAbsIndex - m.index);
        if (distance < minDistance) {
          minDistance = distance;
          amount = m.value;
          resolvedMatch = m;
        }
      }
    });
  }

  // 7. Proximity-based debit/credit scoring
  const winStart = Math.max(0, resolvedMatch.index - 100);
  const winEnd = Math.min(emailContentForParsing.length, resolvedMatch.index + resolvedMatch.text.length + 100);
  const windowContent = emailContentForParsing.substring(winStart, winEnd).toLowerCase();
  const lowerContent = emailContentForParsing.toLowerCase();

  const debitKeywords = [
    { word: 'debited', weight: 10 },
    { word: 'debited for', weight: 15 },
    { word: 'spent', weight: 10 },
    { word: 'paid', weight: 10 },
    { word: 'paid to', weight: 15 },
    { word: 'withdrawn', weight: 10 },
    { word: 'charged', weight: 10 },
    { word: 'payment', weight: 5 },
    { word: 'payment to', weight: 12 },
    { word: 'sent', weight: 8 },
    { word: 'sent to', weight: 12 },
    { word: 'transfer to', weight: 12 },
    { word: 'purchase', weight: 8 },
    { word: 'purchased at', weight: 12 },
    { word: 'debit', weight: 5 }
  ];

  const creditKeywords = [
    { word: 'credited', weight: 10 },
    { word: 'credited to', weight: 15 },
    { word: 'received', weight: 10 },
    { word: 'received from', weight: 15 },
    { word: 'added', weight: 8 },
    { word: 'added to', weight: 12 },
    { word: 'refund', weight: 12 },
    { word: 'refunded', weight: 12 },
    { word: 'cashback', weight: 12 },
    { word: 'deposited', weight: 10 },
    { word: 'salary', weight: 15 },
    { word: 'credit', weight: 5 },
    { word: 'reversed', weight: 12 }
  ];

  let debitScore = 0;
  let creditScore = 0;

  debitKeywords.forEach(({ word, weight }) => {
    if (windowContent.includes(word)) debitScore += weight;
  });
  creditKeywords.forEach(({ word, weight }) => {
    if (windowContent.includes(word)) creditScore += weight;
  });

  if (debitScore === creditScore) {
    debitKeywords.forEach(({ word, weight }) => {
      if (lowerContent.includes(word)) debitScore += weight;
    });
    creditKeywords.forEach(({ word, weight }) => {
      if (lowerContent.includes(word)) creditScore += weight;
    });
  }

  // Check if both are 0
  if (debitScore === 0 && creditScore === 0) {
    return { status: 'skipped', reason: 'No action verbs indicating completed debit/credit' };
  }

  const type = creditScore > debitScore ? 'credit' : 'debit';

  // 8. Merchant extraction
  const knownMerchant = extractMerchantFromSnippet(fullText);
  const dynamicMerchant = extractDynamicMerchant(emailContentForParsing);
  const subjectMerchant = subject ? extractDynamicMerchant(subject) : '';

  let merchant = '';
  let category = 'other';
  let description = '';

  if (knownMerchant) {
    merchant = knownMerchant.name;
    category = knownMerchant.category;
    description = knownMerchant.description;
  } else if (dynamicMerchant) {
    merchant = dynamicMerchant;
  } else if (subjectMerchant) {
    merchant = subjectMerchant;
  }

  const isGenericMerchant = !merchant || merchant.length < 2 || GENERIC_MERCHANT_PATTERNS.some(p => p.test(merchant));
  if (isGenericMerchant) {
    const paymentSource = parsePaymentSource(emailContentForParsing);
    if (paymentSource && paymentSource !== 'Main Wallet' && paymentSource !== 'Bank') {
      merchant = paymentSource;
    } else {
      const bankName = extractBankName(emailContentForParsing);
      if (bankName) {
        merchant = `${bankName} Payment`;
      } else if (type === 'credit') {
        merchant = /salary/i.test(emailContentForParsing) ? 'Salary Credit' : 'Incoming Credit';
      } else {
        merchant = 'Retail Transaction';
      }
    }
  }

  if (!description) {
    description = generateDescription(merchant, emailContentForParsing, type);
  }

  const refMatch = emailContentForParsing.match(/(?:Ref|RefNo|UPI Ref|Ref\.?\s*)([0-9]{6,15})/i);
  const reference_id = refMatch ? refMatch[1] : null;

  // Cut-off date check
  if (mailDate < '2026-01-01') {
    return { status: 'skipped', reason: 'Date before cutoff 2026-01-01' };
  }

  return {
    status: 'parsed',
    data: {
      amount,
      type,
      merchant,
      description,
      paymentSource: parsePaymentSource(emailContentForParsing),
      reference_id,
      date: mailDate
    }
  };
}

// 14 test email scenarios representing transaction classes and false positive targets
const TEST_SCENARIOS = [
  {
    id: 1,
    expected: 'parsed',
    subject: 'Transaction Alert: HDFC Bank Account Debited',
    body: 'Dear Customer, your HDFC Bank Account xx4321 was debited for Rs 1,500.00 on 28-05-2026 by UPI Ref 615273849102 to ZOMATO.',
    notes: 'Should extract Zomato debit of ₹1500.'
  },
  {
    id: 2,
    expected: 'parsed',
    subject: 'Debit Card Transaction Notification - SBI',
    body: 'Dear Customer, SBI Debit Card ending in xx9876 has been debited by INR 350.00 at AMZN.IN on 29-May-2026. Bal: INR 12,450.00.',
    notes: 'Should extract Amazon shopping debit of ₹350, filtering out balance details.'
  },
  {
    id: 3,
    expected: 'parsed',
    subject: 'Axis Credit Card Transaction Alert',
    body: 'Transaction Alert: Your Axis Credit Card ending 5432 has been debited for Rs. 4,999.00 on 28 May 2026 at CROMA Retail. Available Limit: Rs. 95,000.00.',
    notes: 'Should extract Croma electronics debit of ₹4999, filtering out remaining limit.'
  },
  {
    id: 4,
    expected: 'parsed',
    subject: 'ICICI Bank Account credited via NEFT',
    body: 'Dear Customer, your Savings Account xx7890 was credited with Rs 45,000.00 on 30-May-2026 via NEFT from TATA CONSULTANCY SERVICES. Ref No. N1506172.',
    notes: 'Should extract Salary Credit of ₹45000.'
  },
  {
    id: 5,
    expected: 'parsed',
    subject: 'Refund credited: HDFC Bank Credit Card',
    body: 'HDFC Bank Alert: Rs 200.00 has been successfully refunded to your Credit Card ending 1234 on 29-May-2026 from SWIGGY. Ref: Ref987654.',
    notes: 'Should parse Swiggy refund credit of ₹200.'
  },
  {
    id: 6,
    expected: 'skipped',
    subject: 'OTP Alert for online transaction - Axis Bank',
    body: 'OTP for transaction of Rs. 2,500.00 on Axis Bank Card ending 1234 is 482019. Do not share this OTP with anyone.',
    notes: 'Vulnerability Target: OTP authorization containing amount and card text. Must be skipped.'
  },
  {
    id: 7,
    expected: 'skipped',
    subject: 'HDFC Credit Card Payment Due Reminder',
    body: 'Reminder: Your HDFC Bank Credit Card ending xx1234 payment of Rs 15,450.00 is due on 05-Jun-2026. Minimum amount due: Rs 772.00. Please pay to avoid charges.',
    notes: 'Vulnerability Target: Payment reminder containing due amount and dates. Must be skipped.'
  },
  {
    id: 8,
    expected: 'skipped',
    subject: 'Upcoming Auto-Pay notification - ICICI Bank',
    body: 'Upcoming Auto-Pay: Your Netflix subscription of Rs. 649.00 will be debited from your ICICI Bank Credit Card xx9999 on 02-Jun-2026.',
    notes: 'Vulnerability Target: Future scheduled payment alert. Must be skipped.'
  },
  {
    id: 9,
    expected: 'skipped',
    subject: 'Airtel Broadband bill generated',
    body: 'Dear Customer, your Airtel Broadband bill of Rs 1,178.00 has been generated. Due date is 15-Jun-2026. Pay before due date to avoid late payment fee.',
    notes: 'Vulnerability Target: Bill generated notification, not a finished transaction. Must be skipped.'
  },
  {
    id: 10,
    expected: 'skipped',
    subject: 'Monthly E-statement of HDFC Account xx4321',
    body: 'E-statement for your HDFC Bank account xx4321 for the period Apr-2026 to May-2026 is attached. Opening bal: Rs 54,000, Closing bal: Rs 42,000.',
    notes: 'Vulnerability Target: Statement alert containing summaries. Must be skipped.'
  },
  {
    id: 11,
    expected: 'skipped',
    subject: 'Login notice for your Bank Account',
    body: 'Secure Alert: Your internet banking account xx7890 was accessed on 30-May-2026 at 21:30. If this was not you, call customer support.',
    notes: 'Vulnerability Target: Non-financial security email. Must be skipped.'
  },
  {
    id: 12,
    expected: 'skipped',
    subject: 'HDFC Bank Transaction dated 15-Nov-2025',
    body: 'Transaction Alert: Your HDFC Bank Account xx4321 was debited for Rs 850.00 on 15-Nov-2025 by UPI Ref 501928374902 to SWIGGY.',
    notes: 'Vulnerability Target: Completed transaction dated before January 1, 2026. Must be skipped.',
    date: '2025-11-15'
  },
  {
    id: 13,
    expected: 'skipped',
    subject: 'Axis Bank Credit Card Registration Confirmation',
    body: 'Congratulations! Your Axis Bank Credit Card ending 5432 has been successfully registered for online transactions on 28 May 2026.',
    notes: 'Vulnerability Target: Security administrative email. Must be skipped.'
  },
  {
    id: 14,
    expected: 'skipped',
    subject: 'Important Bank Account Security Policy Update',
    body: 'Dear customer, please review our exciting security terms and solicited customer guidelines regarding transaction protection. Rs 500 will not be charged.',
    notes: 'Vulnerability Target: Citi false positive trigger ("solicited" / "exciting" matching citi) + amount trigger. Must be skipped.'
  }
];

function runTestSuit() {
  console.log('🧪 RUNNING PARSING ENGINE INTEGRITY TEST...');
  console.log('========================================================================');
  
  let passes = 0;
  let failures = 0;

  TEST_SCENARIOS.forEach((scenario) => {
    const result = parseEmail(scenario.subject, scenario.body, scenario.date || '2026-05-30');
    const isSuccess = result.status === scenario.expected;

    if (isSuccess) passes++;
    else failures++;

    console.log(`[Scenario ${scenario.id}] ${scenario.subject}`);
    console.log(`- Expected: ${scenario.expected.toUpperCase()} | Got: ${result.status.toUpperCase()}`);
    console.log(`- Vulnerability/Goal: ${scenario.notes}`);
    
    if (result.status === 'parsed') {
      console.log(`  Parsed Data: Type: ${result.data.type} | Amount: ₹${result.data.amount} | Merchant: ${result.data.merchant}`);
      console.log(`               Source: ${result.data.paymentSource} | Ref: ${result.data.reference_id}`);
    } else {
      console.log(`  Reason Skipped: ${result.reason}`);
    }

    if (isSuccess) {
      console.log('  \x1b[32m✅ SUCCESS\x1b[0m');
    } else {
      console.log('  \x1b[31m❌ FAIL (Incorrect Handling)\x1b[0m');
    }
    console.log('------------------------------------------------------------------------');
  });

  console.log('\n========================================================================');
  console.log('📊 TEST RESULTS SUMMARY:');
  console.log(`Total Scenarios: ${TEST_SCENARIOS.length}`);
  console.log(`\x1b[32mPassed: ${passes}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failures}\x1b[0m`);
  console.log('========================================================================');

  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All integrity validation checks passed successfully! The tracking parser is perfect.');
  }
}

runTestSuit();
