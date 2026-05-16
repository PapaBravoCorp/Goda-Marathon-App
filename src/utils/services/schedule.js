import { supabase } from '../supabaseClient';

// TODO: [AUTH] Replace anon-key writes with service_role via Edge Functions
// TODO: [RLS] Add admin-only write policies once auth is in place

const TABLE_NAME = 'event_schedule';

export const getEventSchedule = async (eventId) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching schedule', error);
    return [];
  }
};

export const addScheduleItem = async (itemData) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([{ ...itemData, updated_by: 'admin' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding schedule item', error);
    throw error;
  }
};

export const updateScheduleItem = async (id, updates) => {
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
    console.error('Error updating schedule item', error);
    throw error;
  }
};

export const deleteScheduleItem = async (id) => {
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting schedule item', error);
    throw error;
  }
};
