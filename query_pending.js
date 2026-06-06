import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, merchant, description, notes, card_last4, card_issuer, payment_mode, approval_status, user_id');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${data.length} transactions total:`);
  for (const tx of data) {
    console.log('----------------------------------------');
    console.log(`ID: ${tx.id} | User: ${tx.user_id}`);
    console.log(`Merchant: ${tx.merchant} | Desc: ${tx.description} | Status: ${tx.approval_status}`);
    console.log(`Amt: ${tx.amount} | Mode: ${tx.payment_mode} | Card: ${tx.card_issuer} ${tx.card_last4}`);
    console.log(`Notes (Snippet): ${tx.notes?.substring(0, 300)}`);
  }
}

run();
