/**
 * Test-only side-effect module, imported FIRST by test support that pulls the real reducer: the store reaches the Supabase
 * client at import time. A dummy public URL keeps it inert (no call is ever made by these pure tests).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
export {};
