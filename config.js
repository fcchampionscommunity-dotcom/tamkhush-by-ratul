
// ======================================
// TAMKHUSH BY RATUL
// SUPABASE CONFIGURATION
// ======================================

const SUPABASE_URL =
  "https://sifxuupldjriaedqztmd.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_rXBA5gz8i9rb2xgrrpwz0A_cJG5Ubf6";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
