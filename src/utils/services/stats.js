import { supabase } from '../supabaseClient';

/**
 * Registration counts for one event: get_reg_stats() from migration 0022.
 *
 * Admins and stats viewers only; the database checks, not this file. The
 * result is counts and nothing else -- no names, contacts or money -- which is
 * why stats viewers can be given it without access to any table.
 */
export async function getRegStats(eventId) {
  const { data, error } = await supabase.rpc('get_reg_stats', { p_event_id: eventId });
  if (error) throw error;
  return data;
}

/** Turn a get_reg_stats() failure into something worth showing a person. */
export function describeStatsError(error) {
  const message = error?.message || '';
  if (error?.code === 'PGRST202' || /Could not find the function/i.test(message)) {
    return 'Stats are not set up on the database yet. Apply migration 0022_stats_viewers.sql.';
  }
  if (error?.code === '42501') {
    return 'This account no longer has access to the stats. Sign out and ask an organiser.';
  }
  if (/fetch|network/i.test(message)) {
    return 'Could not reach the server. Check your connection; the page will try again.';
  }
  return message || 'Could not load the stats.';
}
