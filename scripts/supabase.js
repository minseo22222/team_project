
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = 'https://qjusboguowpyamitokjh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdXNib2d1b3dweWFtaXRva2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjU5MDIsImV4cCI6MjA3NTY0MTkwMn0._AMM8U_rwX6RLAe1ACIvdC-047nnykVaQvnfcAuXZ0Q'


// 클라이언트 중복 생성을 방지
let supabase;



if (!window.supabaseClient) {
  window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

supabase = window.supabaseClient;

export default supabase;