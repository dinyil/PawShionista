
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cnnardxgnyounidblktz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNubmFyZHhnbnlvdW5pZGJsa3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNTg1MzcsImV4cCI6MjA4MjYzNDUzN30.AINr39GtoufSkIjZvs5fTsRDNMD8WafXwGJKq65-KgE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
