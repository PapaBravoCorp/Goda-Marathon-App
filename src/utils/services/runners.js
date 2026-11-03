import { supabase } from '../supabaseClient';

/**
 * The read-only runner list for one event: list_registrations_basic() from
 * migration 0023. Admins and stats viewers only; the database checks.
 *
 * Phone and email arrive already masked (last 4 digits; first 2 characters +
 * domain) -- the full values never leave the database -- and there is no DOB,
 * emergency contact, blood group or medical information at all.
 */
export async function getRunners(eventId) {
  const { data, error } = await supabase.rpc('list_registrations_basic', { p_event_id: eventId });
  if (error) throw error;
  return data || [];
}

/** Turn a list_registrations_basic() failure into something worth showing a person. */
export function describeRunnersError(error) {
  const message = error?.message || '';
  if (error?.code === 'PGRST202' || /Could not find the function/i.test(message)) {
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
