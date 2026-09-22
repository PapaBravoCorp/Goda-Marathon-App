import { supabase } from '../supabaseClient';
import { getCategoryAvailability } from './registrations';

const TABLE_NAME = 'event_categories';

/**
 * Categories for an event, each carrying how many places are taken.
 *
 * The count used to be derived by SELECTing every row of `registrations` and
 * tallying them in the browser. That ran on the homepage, the event page and
 * the registration form, for anonymous visitors -- which is to say the public
 * site downloaded the entire participant list, personal and medical fields
 * included, to render "12 slots left". It also grew linearly with entries:
 * five hundred runners meant five hundred rows transferred per page view.
 *
 * It now asks the database for counts, which is all it ever needed.
 *
 * @param {string} eventId - the event's id
 * @param {string} [eventSlug] - retained for call-site compatibility; on this
 *   project events.id and the slug are the same value.
 */
export const getEventCategories = async (eventId, eventSlug = null) => {
  if (!eventId) return [];

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true });
    if (error) throw error;

    const categories = data || [];
    if (categories.length === 0) return categories;

    const availability = await getCategoryAvailability(eventSlug || eventId);
    const byId = new Map(availability.map(a => [a.category_id, a]));
    const byName = new Map(availability.map(a => [a.name, a]));

    return categories.map(cat => {
      const stat = byId.get(cat.id) || byName.get(cat.name);
      return {
        ...cat,
        registration_count: stat?.taken ?? 0,
        slots_left: stat?.slots_left ?? null,
      };
    });
  } catch (error) {
    console.error('Error fetching categories', error);
    return [];
  }
};

/** Admin only — 0006 restricts writes to authenticated admins. */
export const addEventCategory = async (categoryData) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([{ ...categoryData, updated_by: 'admin' }])
    .select()
    .single();
  if (error) {
    console.error('Error adding category', error);
    throw error;
  }
  return data;
};

export const updateEventCategory = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ ...updates, updated_by: 'admin' })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating category', error);
    throw error;
  }
  return data;
};

export const deleteEventCategory = async (id) => {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Error deleting category', error);
    throw error;
  }
  return true;
};
