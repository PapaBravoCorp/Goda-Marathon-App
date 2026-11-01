import { supabase } from '../supabaseClient';

const TABLE = 'promo_videos';

/**
 * Public: published promo videos in display order. Never rejects. Before
 * migration 0021 runs, or on any failure, the list is empty and the homepage
 * band stays hidden.
 */
export const getPublishedPromoVideos = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, youtube_id, title, caption, orientation')
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching promo videos', error);
    return [];
  }
};

/** Admin: every video, hidden ones included. Throws so a missing table is reported. */
export const getAllPromoVideos = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const addPromoVideo = async (payload) => {
  const { data, error } = await supabase.from(TABLE).insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const updatePromoVideo = async (id, updates) => {
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deletePromoVideo = async (id) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  return true;
};

export const reorderPromoVideos = async (orderedIds) => {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(TABLE).update({ display_order: index }).eq('id', id)
    )
  );
};
