import fs from 'fs';
import path from 'path';

// Read environment variables from .env
const envPath = path.resolve('.env');
let supabaseUrl = '';
let supabaseKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL\s*=\s*(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.+)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseKey = keyMatch[1].trim();
} catch (e) {
  console.error('Error reading .env file:', e.message);
  process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key not found in .env');
  process.exit(1);
}

async function runAudit() {
  console.log('🔍 Starting Dhanrakshak Transaction & Tracker Audit...');
  console.log(`URL: ${supabaseUrl}`);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/transactions?select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    }

    const txns = await response.json();
    console.log(`\n📊 Fetched ${txns.length} transactions from the database.`);

    const anomalies = [];
    const stats = {
      total: txns.length,
      preCutoff: 0,
      overLimitAmount: 0,
      hasReminderKeyword: 0,
      hasOtpKeyword: 0,
      falseCitiBankMatch: 0,
      emptyMerchant: 0,
    };

    txns.forEach((txn) => {
      const notes = (txn.notes || '').toLowerCase();
      const subject = (txn.description || '').toLowerCase();
      const merchant = (txn.merchant || '').toLowerCase();
      const date = txn.date;
      const amount = Number(txn.amount);

      let isAnomalous = false;
      const reasons = [];

      // A. Pre-cutoff date check (January 1, 2026)
      if (date && date < '2026-01-01') {
        stats.preCutoff++;
        isAnomalous = true;
        reasons.push(`Date ${date} is before the cut-off (2026-01-01)`);
      }

      // B. Amount bounds check (DECIMAL(12,2) and <= 999999.99)
      if (amount > 999999.99 || amount <= 0) {
        stats.overLimitAmount++;
        isAnomalous = true;
        reasons.push(`Amount ₹${amount} is invalid or out of bounds (<= 999,999.99)`);
      }

      // C. Reminder alert check
      const reminderKeywords = /\b(?:due|reminder|remind|upcoming|due\s+date|minimum\s+due|statement\s+for|payment\s+due|overdue|payable|bill\s+generated|statement\s+of|monthly\s+statement)\b/i;
      const futureKeywords = /(?:will\s+be\s+debited|scheduled\s+for|pay\s+before|reminder\b)/i;
      if (reminderKeywords.test(notes) || futureKeywords.test(notes)) {
        stats.hasReminderKeyword++;
        isAnomalous = true;
        reasons.push('Contains reminder or scheduled payment keywords');
      }

      // D. OTP/One-time password check
      const otpKeywords = /\b(?:otp|one\s*time\s*password|verification\s*code|verification\s*pin|do\s*not\s*share|authorise\s*transaction|authorizing\s*txn|securesubmit|approve\s*this\s*txn)\b/i;
      if (otpKeywords.test(notes)) {
        stats.hasOtpKeyword++;
        isAnomalous = true;
        reasons.push('Contains OTP or verification code keywords');
      }

      // E. False citi bank match check
      if (merchant.includes('citi') && !/\bciti\b/i.test(notes) && !/\bciti\b/i.test(subject)) {
        stats.falseCitiBankMatch++;
        isAnomalous = true;
        reasons.push('False positive Citi Bank match');
      }

      // F. Empty/Placeholder merchant
      if (!txn.merchant || txn.merchant.length < 2) {
        stats.emptyMerchant++;
        isAnomalous = true;
        reasons.push('Empty or invalid merchant name');
      }

      if (isAnomalous) {
        anomalies.push({
          id: txn.id,
          amount: txn.amount,
          date: txn.date,
          merchant: txn.merchant,
          reasons,
          notes: txn.notes
        });
      }
    });

    console.log('\n--- AUDIT SUMMARY ---');
    console.log(`Total Checked: ${stats.total}`);
    console.log(`Anomalies Found: ${anomalies.length}`);
    console.log(`- Pre-2026-01-01 date: ${stats.preCutoff}`);
    console.log(`- Invalid Amount range: ${stats.overLimitAmount}`);
    console.log(`- Reminder/Future Keywords: ${stats.hasReminderKeyword}`);
    console.log(`- OTP/Verification Keywords: ${stats.hasOtpKeyword}`);
    console.log(`- False Citi Bank Match: ${stats.falseCitiBankMatch}`);
    console.log(`- Empty/Invalid Merchant: ${stats.emptyMerchant}`);
    console.log('---------------------\n');

    if (anomalies.length > 0) {
      console.log('⚠️ ANOMALIES DETECTED DETAIL:');
      anomalies.slice(0, 10).forEach((anom, idx) => {
        console.log(`\n[${idx + 1}] Transaction ID: ${anom.id}`);
        console.log(`    Date: ${anom.date} | Amount: ₹${anom.amount} | Merchant: ${anom.merchant}`);
        console.log(`    Reasons: ${anom.reasons.join(', ')}`);
        console.log(`    Snippet: "${(anom.notes || '').substring(0, 120)}..."`);
      });
      if (anomalies.length > 10) {
        console.log(`... and ${anomalies.length - 10} more anomalies.`);
      }
    } else {
      console.log('✅ Audit passed! All transactions are valid and compliant with tracker rules.');
    }
  } catch (err) {
    console.error('Audit run failed:', err.message);
  }
}

runAudit();
