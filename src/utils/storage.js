import { supabase } from './supabaseClient';
import { CATEGORY_TIME_RANGES } from './constants';

const TABLE_NAME = 'registrations';

export const getRegistrations = async (eventId = null) => {
  try {
    let query = supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (eventId) {
      query = query.eq('event_id', eventId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching from Supabase', error);
    return [];
  }
};

const generateTime = (min, max) => {
  const bias = Math.random() * Math.random(); 
  const totalMinutes = Math.floor(min + (max - min) * bias);
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor(Math.random() * 60);
  
  return `${hours.toString()}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const addRegistration = async (registrationData) => {
  try {
    // Check Duplicate Exception (1 email per event)
    const { data: existing, error: checkError } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .eq('email', registrationData.email)
      .eq('event_id', registrationData.eventId)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) {
      throw new Error("Already Registered");
    }

    // Time Generation logic based on ranges
    let mockFinishTime = '0:00:00';
    if (CATEGORY_TIME_RANGES[registrationData.category]) {
      const { min, max } = CATEGORY_TIME_RANGES[registrationData.category];
      mockFinishTime = generateTime(min, max);
    }

    const bib = Math.floor(1000 + Math.random() * 9000).toString();

    const insertData = {
      first_name: registrationData.firstName,
      last_name: registrationData.lastName,
      email: registrationData.email,
      dob: registrationData.dob,
      gender: registrationData.gender,
      category: registrationData.category,
      tshirt_size: registrationData.tshirtSize,
      estimated_time: registrationData.estimatedTime,
      price: registrationData.price,
      event_id: registrationData.eventId,
      event_name: registrationData.eventName,
      bib: bib,
      payment_status: 'PENDING',
      mock_finish_time: mockFinishTime
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving to Supabase', error);
    throw error;
  }
};

export const updateRegistration = async (id, updates) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('Error updating Supabase', error);
    return false;
  }
};

export const clearAll = async () => {
  try {
    // WARNING: This is destructive. In Supabase we'd typically delete everything or use a RPC.
    // For simplicity, we'll just delete all rows.
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all where id is not dummy

    if (error) throw error;
  } catch (error) {
    console.error('Error clearing Supabase', error);
  }
};

export const exportToCSV = async (eventId) => {
  const data = await getRegistrations(eventId);
  if (data.length === 0) {
    alert("No data available to export.");
    return;
  }

  const headers = ["Name", "Email", "Category", "Bib Number", "Finish Time", "Event ID", "Payment Status", "Created At"];
  
  const rows = data.map(r => [
    `"${r.first_name} ${r.last_name}"`,
    `"${r.email}"`,
    `"${r.category}"`,
    `"${r.bib}"`,
    `"${r.mock_finish_time}"`,
    `"${r.event_id}"`,
    `"${r.payment_status}"`,
    `"${new Date(r.created_at).toLocaleString()}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `registrations_${eventId || 'all'}.csv`);
  document.body.appendChild(link);

  link.click();
  document.body.removeChild(link);
};

export const getStats = async (eventId = null) => {
  const registrations = await getRegistrations(eventId);
  
  const totalRegistrations = registrations.length;
  const revenue = registrations.reduce((sum, r) => sum + (parseFloat(r.price) || 0), 0);
  
  return {
    totalRegistrations,
    revenue
  };
};

// ============================================================
// Past Events Media
// ============================================================
const MEDIA_TABLE = 'past_events_media';

export const getAllPastEvents = async () => {
  try {
    const { data, error } = await supabase
      .from(MEDIA_TABLE)
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
      .from(MEDIA_TABLE)
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
      .from(MEDIA_TABLE)
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
      .from(MEDIA_TABLE)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting past event media', error);
    throw error;
  }
};

// ============================================================
// Events
// ============================================================
const EVENTS_TABLE = 'events';

export const getCurrentEvent = async () => {
  try {
    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching current event', error);
    return null;
  }
};

export const getEventById = async (id) => {
  try {
    const { data, error } = await supabase
      .from(EVENTS_TABLE)
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
      .from(EVENTS_TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating event', error);
    throw error;
  }
};
