import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env variables
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

console.log('Testing Supabase Auth & Session...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    const t0 = performance.now();
    console.log('Calling supabase.auth.getSession()...');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const t1 = performance.now();
    console.log(`getSession took ${t1 - t0} ms`);
    console.log('Session data:', JSON.stringify(sessionData, null, 2));
    if (sessionError) console.error('Session error:', sessionError);

    console.log('\nCalling supabase.auth.getUser()...');
    const t2 = performance.now();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const t3 = performance.now();
    console.log(`getUser took ${t3 - t2} ms`);
    console.log('User data:', JSON.stringify(userData, null, 2));
    if (userError) console.error('User error:', userError);

  } catch (err) {
    console.error('Fatal error during test:', err);
  }
}

test();
