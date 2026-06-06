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
    .from('email_scan_logs')
    .select('*')
    .order('scanned_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${data.length} scan logs:`);
  for (const log of data) {
    console.log('----------------------------------------');
    console.log(`ID: ${log.id} | User: ${log.user_id}`);
    console.log(`Scanned At: ${log.scanned_at}`);
    console.log(`Status: ${log.status} | Processed: ${log.emails_processed} | Found: ${log.transactions_found}`);
    console.log(`Error: ${log.error_message}`);
  }
}

run();
