import { supabase } from '../supabaseClient';

const isMissingFunction = (error) =>
  error?.code === 'PGRST202' || /Could not find the function/i.test(error?.message || '');

/**
 * The read-only runner list for one event. Admins and stats viewers only; the
 * database checks.
 *
 * list_runners() (migration 0027) returns the full phone number, the email
 * masked to its first 2 characters + domain, and `paid_entry` on a row that
 * is not paid when the same person paid in another entry. There is no DOB,
 * emergency contact, blood group or medical information at all.
 *
 * Until 0027 is applied, falls back to 0023's list_registrations_basic(),
 * whose phone is masked to the last 4 digits (`phone_masked`).
 */
export async function getRunners(eventId) {
  const { data, error } = await supabase.rpc('list_runners', { p_event_id: eventId });
  if (!error) return data || [];
  if (!isMissingFunction(error)) throw error;

  const fallback = await supabase.rpc('list_registrations_basic', { p_event_id: eventId });
  if (fallback.error) throw fallback.error;
  return fallback.data || [];
}

/** Turn a list_registrations_basic() failure into something worth showing a person. */
export function describeRunnersError(error) {
  const message = error?.message || '';
  if (isMissingFunction(error)) {
    return 'The runner list is not set up on the database yet. Apply migration 0023_runner_lookup.sql.';
  }
  if (error?.code === '42501') {
    return 'This account no longer has access to the runner list. Sign out and ask an organiser.';
  }
  if (/fetch|network/i.test(message)) {
    return 'Could not reach the server. Check your connection and press Refresh.';
  }
  return message || 'Could not load the runner list.';
}
