import { supabase } from '../supabaseClient';

// TODO: [AUTH] Replace anon-key writes with service_role via Edge Functions
// TODO: [RLS] Add admin-only write policies once auth is in place

const TABLE_NAME = 'event_categories';

/**
 * Fetch all categories for an event, with derived registration counts.
 * @param {string} eventId - UUID of the event
 * @param {string} eventSlug - TEXT slug for counting registrations (legacy)
 */
export const getEventCategories = async (eventId, eventSlug = null) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true });
    if (error) throw error;

    const categories = data || [];

    // Derive registration counts from registrations table if slug provided
    if (eventSlug && categories.length > 0) {
      const { data: regs, error: regErr } = await supabase
        .from('registrations')
        .select('category')
        .eq('event_id', eventSlug)
        .neq('payment_status', 'CANCELLED');

      if (!regErr && regs) {
        const counts = {};
        regs.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
        categories.forEach(cat => {
          cat.registration_count = counts[cat.name] || 0;
        });
      }
    }

    return categories;
  } catch (error) {
    console.error('Error fetching categories', error);
    return [];
  }
};

export const addEventCategory = async (categoryData) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([{ ...categoryData, updated_by: 'admin' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding category', error);
    throw error;
  }
};

export const updateEventCategory = async (id, updates) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ ...updates, updated_by: 'admin' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating category', error);
    throw error;
  }
};

export const deleteEventCategory = async (id) => {
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting category', error);
    throw error;
  }
};
