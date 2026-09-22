import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Missing configuration used to be a console.warn, after which createClient was
 * called with `undefined` anyway. The app then built and deployed cleanly and
 * every page failed at runtime with an opaque network error -- the registration
 * form included, where the failure looks to a runner like their entry was lost.
 *
 * Failing here instead means a misconfigured deployment is obvious immediately
 * rather than after the first person tries to sign up.
 */
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
    '(see .env.example). On Vercel these are set per environment under ' +
    'Settings > Environment Variables, and the project must be redeployed after ' +
    'changing them -- Vite inlines them at build time, not at runtime.'
  );
}

if (/service_role/.test(supabaseAnonKey)) {
  // The service_role key bypasses every Row Level Security policy. In a browser
  // bundle it hands full read/write access to anyone who opens devtools.
  throw new Error(
    'VITE_SUPABASE_ANON_KEY looks like a service_role key. That key bypasses all ' +
    'security policies and must never be shipped to a browser. Use the anon / ' +
    'publishable key.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // The admin session should survive a page reload, and refresh itself while
    // the dashboard sits open on a long day of checking people in.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
