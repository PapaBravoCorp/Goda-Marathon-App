import { supabase } from '../supabaseClient';

const TABLE_NAME = 'past_events_media';

export const getAllPastEvents = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('event_year, event_title')
      .order('event_year', { ascending: false });

    if (error) throw error;

    const seen = new Map();
    (data || []).forEach(row => {
      if (!seen.has(row.event_year)) {
        seen.set(row.event_year, row.event_title);
      }
    });

    return Array.from(seen.entries()).map(([year, title]) => ({ year, title }));
  } catch (error) {
    console.error('Error fetching past events', error);
    return [];
  }
};

export const getPastEventMedia = async (eventYear = null) => {
  try {
    let query = supabase
      .from(TABLE_NAME)
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (eventYear) {
      query = query.eq('event_year', eventYear);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching past event media', error);
    return [];
  }
};

export const addPastEventMedia = async (mediaData) => {
  try {
    const insertData = {
      event_year: mediaData.eventYear,
      event_title: mediaData.eventTitle,
      media_type: mediaData.mediaType,
      url: mediaData.url,
      caption: mediaData.caption || '',
      display_order: mediaData.displayOrder || 0
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding past event media', error);
    throw error;
  }
};

export const deletePastEventMedia = async (id) => {
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting past event media', error);
    throw error;
  }
};
