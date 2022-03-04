import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL ?? 'null',
  process.env.PUBLIC_SUPABASE_KEY ?? 'null'
);

export default supabase;
