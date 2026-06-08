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
const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function list() {
  console.log('Querying public.profiles...');
  const { data, error } = await supabase.from('profiles').select('id, email, subscription_status, subscription_plan_type, subscription_expires_at');
  if (error) {
    console.error('Error fetching profiles:', error.message);
  } else {
    console.log(`Found ${data.length} profiles:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

list();
