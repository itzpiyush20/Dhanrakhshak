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

async function list() {
  console.log('Querying public.profiles...');
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
  } else {
    console.log(`Found ${data.length} profiles:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

list();
