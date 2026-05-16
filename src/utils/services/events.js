import { supabase } from '../supabaseClient';

// TODO: [AUTH] Replace anon-key writes with service_role via Edge Functions
// TODO: [RLS] Add admin-only write policies once auth is in place

const TABLE_NAME = 'events';

/** Cached current event to avoid repeated queries */
let _cachedCurrentEvent = null;

/**
 * Fetch the current event. Result is cached for the session.
 * Returns the full event row including `id` (UUID) and `slug` ("goda-2026").
 */
export const getCurrentEvent = async () => {
  if (_cachedCurrentEvent) return _cachedCurrentEvent;
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw error;
    _cachedCurrentEvent = data;
    return data;
  } catch (error) {
    console.error('Error fetching current event', error);
    return null;
  }
};

/** Invalidate cache (call after updating event settings) */
export const invalidateEventCache = () => {
  _cachedCurrentEvent = null;
};

export const getEventById = async (id) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching event', error);
    return null;
  }
};

export const updateEvent = async (id, updates) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    invalidateEventCache();
    return data;
  } catch (error) {
    console.error('Error updating event', error);
    throw error;
  }
};
