import { supabase } from '../supabaseClient';

/**
 * Admin authentication.
 *
 * The dashboard used to compare a typed password against
 * `import.meta.env.VITE_ADMIN_PASSWORD` in the browser. Two problems with that,
 * either of which is enough on its own:
 *
 *   * Vite inlines every VITE_* value into the bundle at build time. The
 *     password was sitting in plain text in a file served to every visitor --
 *     `grep goda2026 dist/assets/*.js` found it.
 *   * Even without reading it, the gate was a React state flag. Setting
 *     sessionStorage['goda-admin-auth'] = 'true' in the console opened the
 *     dashboard.
 *
 * Neither mattered while the database let the anon key do anything anyway. Now
 * that 0006 has locked the tables to `public.is_admin()`, the session is what
 * grants access, and the check happens in Postgres on every single query rather
 * than in a component that can be edited from the console.
 */

/** Sign in with an allow-listed admin email and password. */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Is the signed-in user on the admin allow-list?
 *
 * Asked of the database rather than inferred from the presence of a session:
 * a valid Supabase account is not the same thing as an administrator, and after
 * 0006 a non-admin session can read no more than an anonymous visitor can.
 */
export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) {
    // A missing function means the security migration has not been applied to
    // this project yet. Say so, rather than letting it read as a wrong password.
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      console.error(
        'public.is_admin() is missing. Apply supabase/migrations/0006_security_lockdown.sql ' +
        'and add your user to public.admin_users (see section 8 of that file).'
      );
    } else {
      console.error('Admin check failed', error);
    }
    return false;
  }
  return data === true;
}

/**
 * Subscribe to sign-in/sign-out, including in another tab.
 * Returns an unsubscribe function.
 */
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

/** Turn a Supabase auth error into something worth showing a person. */
export function describeAuthError(error) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) {
    return 'That email and password do not match an account.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'This account has not been confirmed yet. Confirm it in the Supabase dashboard.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (/fetch|network/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return message || 'Sign-in failed. Please try again.';
}
