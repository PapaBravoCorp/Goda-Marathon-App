import { supabase } from '../supabaseClient';
import { deleteStoredImageAt } from './storage';

const TABLE = 'featured_guests';

/**
 * Public: published guests in display order. Never rejects. Before migration
 * 0020 runs, or on any failure, the list is empty and the homepage band stays
 * hidden.
 */
export const getPublishedGuests = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching featured guests', error);
    return [];
  }
};

/** Admin: everyone, hidden guests included. Throws so a missing table is reported. */
export const getAllGuests = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const addGuest = async (payload) => {
  const { data, error } = await supabase.from(TABLE).insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const updateGuest = async (id, updates) => {
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

/**
 * Delete the row, then its uploaded photo, in that order so a failed delete
 * never leaves the homepage pointing at a file that is already gone.
 */
export const deleteGuest = async (guest) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', guest.id);
  if (error) throw error;
  await deleteStoredImageAt(guest.photo_url);
  return true;
};

export const reorderGuests = async (orderedIds) => {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(TABLE).update({ display_order: index }).eq('id', id)
    )
  );
};
