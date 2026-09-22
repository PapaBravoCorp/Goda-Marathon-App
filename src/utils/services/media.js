import { supabase } from '../supabaseClient';
import { deleteStoredMedia } from './storage';

const TABLE_NAME = 'past_events_media';

// Removed: getAllPastEvents() derived the edition list by grouping media on
// event_year, which silently collapses two editions held in the same year.
// Use getPublishedPastEvents() / getAllPastEventRecords() from
// services/pastEvents.js — those read real rows and are keyed by id.

/**
 * Media for one edition, addressed by its id.
 *
 * Deliberately not by year: two editions can share a year, and the year string
 * cannot tell them apart. past_event_id is the authoritative link.
 */
export const getPastEventMedia = async (pastEventId = null) => {
  try {
    let query = supabase
      .from(TABLE_NAME)
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (pastEventId) {
      query = query.eq('past_event_id', pastEventId);
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
      past_event_id: mediaData.pastEventId,
      event_year: mediaData.eventYear,
      event_title: mediaData.eventTitle,
      media_type: mediaData.mediaType,
      url: mediaData.url,
      caption: mediaData.caption || '',
      display_order: mediaData.displayOrder ?? 0,
      storage_path: mediaData.storagePath || null,
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

/** Insert many rows in one round trip — used by the bulk uploader. */
export const addPastEventMediaBulk = async (items) => {
  if (!items.length) return [];
  const rows = items.map(m => ({
    past_event_id: m.pastEventId,
    event_year: m.eventYear,
    event_title: m.eventTitle,
    media_type: m.mediaType,
    url: m.url,
    caption: m.caption || '',
    display_order: m.displayOrder ?? 0,
    storage_path: m.storagePath || null,
  }));

  const { data, error } = await supabase.from(TABLE_NAME).insert(rows).select();
  if (error) throw error;
  return data || [];
};

export const updatePastEventMedia = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/** Persist a reordered list. */
export const reorderPastEventMedia = async (orderedIds) => {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(TABLE_NAME).update({ display_order: index }).eq('id', id)
    )
  );
};

/**
 * Delete a media row, and the underlying file when we own it.
 * Storage is cleaned first so a failure there does not leave an orphaned object
 * with no row pointing at it.
 */
export const deletePastEventMedia = async (id, storagePath = null) => {
  try {
    if (storagePath) await deleteStoredMedia(storagePath);

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

/**
 * Keep the denormalised display columns on an edition's media in step after it
 * is renamed. The link itself is past_event_id, so nothing is stranded if this
 * fails — these columns only affect what the admin list shows.
 */
export const syncMediaEventInfo = async (pastEventId, year, title) => {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ event_year: year, event_title: title })
    .eq('past_event_id', pastEventId);
  if (error) throw error;
};
