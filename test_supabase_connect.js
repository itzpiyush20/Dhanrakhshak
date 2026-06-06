import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read environment variables manually from .env
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

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing Supabase connection via official SDK...');
  console.log('URL:', supabaseUrl);
  
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('approval_status', 'pending')
      .limit(5);
      
    if (error) {
      console.error('Error fetching transactions:', error);
    } else {
      console.log('Success! Fetched transactions count:', data?.length);
      console.log('Sample transaction:', data?.[0]);
    }
  } catch (err) {
    console.error('Uncaught exception during fetch:', err);
  }
}

test();
