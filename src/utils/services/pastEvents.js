import { supabase } from '../supabaseClient';

// TODO: [AUTH] Writes use the anon key, consistent with the rest of the admin panel.

const TABLE = 'past_events';

/** Public page: published editions only, newest first. */
export const getPublishedPastEvents = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('year', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching past events', error);
    return [];
  }
};

/** Admin: everything, including unpublished. */
export const getAllPastEventRecords = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('display_order', { ascending: true })
      .order('year', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching past events', error);
    return [];
  }
};

// Several editions may share a year — GODA ran two in 2025 — so there is no
// uniqueness check here. Editions are identified by id, not by year.
export const addPastEvent = async (payload) => {
  const { data, error } = await supabase.from(TABLE).insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const updatePastEvent = async (id, updates) => {
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deletePastEvent = async (id) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  return true;
};
