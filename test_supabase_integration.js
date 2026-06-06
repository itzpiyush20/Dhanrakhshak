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

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log('--- STARTING SUPABASE AUTH & RLS INTEGRATION TEST (V2 COLUMNS) ---');
  const email = `test_user_${Math.random().toString(36).substring(7)}@dhanrakshak.in`;
  const password = 'SuperSecretPassword123!';

  try {
    // 1. Sign Up
    console.log(`[1/5] Signing up mock user: ${email}...`);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: 'Test Integration User' }
      }
    });
    if (signUpError) throw signUpError;
    const user = signUpData.user;
    console.log(`SignUp Succeeded! User ID: ${user.id}`);

    // 2. Fetch profile
    console.log('[2/5] Querying profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;
    console.log(`Profile Succeeded! Name: "${profile.full_name}"`);

    // 3. Insert transaction with V2 Columns
    console.log('[3/5] Inserting test pending transaction with V2 columns...');
    const { data: txn, error: txnError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: 1500.00,
        type: 'debit',
        category: 'food',
        description: 'Test Dinner',
        date: new Date().toISOString().split('T')[0],
        source: 'manual',
        approval_status: 'pending',
        merchant: 'Test Restaurant',
        payment_mode: 'upi',
        card_last4: '1234',
        card_issuer: 'HDFC',
        confidence_score: 95,
        event_type: 'debit',
        email_message_id: `test_msg_${Math.random().toString(36).substring(7)}`
      })
      .select()
      .single();
    if (txnError) throw txnError;
    console.log(`Transaction Insert Succeeded! Txn ID: ${txn.id}`);

    // 4. Select transactions
    console.log('[4/5] Querying pending transactions (count: exact)...');
    const { data: txns, error: selectError, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('approval_status', 'pending');
    if (selectError) throw selectError;
    console.log(`Query Succeeded! Count: ${count}, Found: ${txns.length}`);

    // 5. Clean up
    console.log('[5/5] Deleting test user via RPC delete_user()...');
    const { error: deleteError } = await supabase.rpc('delete_user');
    if (deleteError) throw deleteError;
    console.log(`User Deletion Succeeded!`);

    console.log('\n--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('\n❌ Integration Test Failed:', err);
    // Try clean up user in case of failure
    try {
      await supabase.rpc('delete_user');
    } catch {}
  }
}

runTest();
