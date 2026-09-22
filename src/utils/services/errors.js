/**
 * Turn a Supabase/PostgREST error into something an organiser can act on.
 *
 * The admin panels all caught their errors and replaced them with "Failed to
 * save. Please try again." That was survivable while the anon key could write
 * anything, because saves rarely failed. After the Row Level Security lockdown
 * the common failures are an expired session or an account that is not on the
 * admin allow-list -- and "try again" sends someone round the same loop
 * indefinitely, since trying again is exactly what will not help.
 */

export function describeSaveError(error, subject = 'changes') {
  const code = error?.code;
  const message = error?.message || '';

  // PostgREST returns 42501 when a policy refuses the write, and an empty
  // result on an UPDATE the policy filtered out entirely.
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return `You do not have permission to change ${subject}. Sign out and sign in again; if it keeps happening, your account may not be on the admin list.`;
  }

  if (code === 'PGRST301' || /jwt expired|invalid token/i.test(message)) {
    return 'Your session has expired. Sign out and sign back in.';
  }

  if (code === '23505' || /duplicate key/i.test(message)) {
    return `Those ${subject} clash with something that already exists. Check for a duplicate name or entry.`;
  }

  if (code === '23503' || /foreign key/i.test(message)) {
    return `Cannot save: something else still refers to these ${subject}.`;
  }

  if (code === '23514' || /check constraint/i.test(message)) {
    return `One of the values is not allowed. Check the ${subject} and try again.`;
  }

  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  console.error(`Failed to save ${subject}`, error);
  return message
    ? `Could not save ${subject}: ${message}`
    : `Could not save ${subject}. Please try again.`;
}
