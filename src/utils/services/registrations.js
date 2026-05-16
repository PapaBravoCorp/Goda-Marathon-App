import { supabase } from '../supabaseClient';
import { CATEGORY_TIME_RANGES } from '../constants';

// TODO: [AUTH] Replace anon-key writes with service_role via Edge Functions
// TODO: [RLS] Add RLS policies requiring authenticated admin role for mutations
// TODO: [MIGRATION] Migrate registrations.event_id from TEXT slug to UUID FK

const TABLE_NAME = 'registrations';

/**
 * Fetch registrations with optional server-side pagination + filtering.
 * When `options.page` is provided, returns `{ data, total }`.
 * Without pagination options, returns a plain array (backward compat).
 */
export const getRegistrations = async (eventSlug, options = {}) => {
  try {
    const { page, pageSize = 50, search, category, status } = options;
    const usePagination = page !== undefined && page !== null;

    let query = supabase
      .from(TABLE_NAME)
      .select('*', { count: usePagination ? 'exact' : undefined })
      .order('created_at', { ascending: false });

    if (eventSlug) {
      query = query.eq('event_id', eventSlug);
    }

    // Server-side filters
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,bib.ilike.%${search}%`
      );
    }
    if (category) query = query.eq('category', category);
    if (status) query = query.eq('payment_status', status);

    // Pagination
    if (usePagination) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    if (usePagination) {
      return { data: data || [], total: count ?? 0 };
    }
    return data || [];
  } catch (error) {
    console.error('Error fetching registrations', error);
    if (options.page !== undefined) return { data: [], total: 0 };
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
    const { data: existing, error: checkError } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .eq('email', registrationData.email)
      .eq('event_id', registrationData.eventId)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) throw new Error("Already Registered");

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
    console.error('Error saving registration', error);
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
    return data;
  } catch (error) {
    console.error('Error updating registration', error);
    throw error;
  }
};

/** Soft-delete: sets payment_status to CANCELLED */
export const deleteRegistration = async (id) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ payment_status: 'CANCELLED' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error soft-deleting registration', error);
    throw error;
  }
};

export const bulkUpdatePaymentStatus = async (ids, status) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ payment_status: status })
      .in('id', ids)
      .select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error bulk updating', error);
    throw error;
  }
};

export const bulkDeleteRegistrations = async (ids) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ payment_status: 'CANCELLED' })
      .in('id', ids)
      .select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error bulk deleting', error);
    throw error;
  }
};

export const clearAll = async () => {
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  } catch (error) {
    console.error('Error clearing registrations', error);
  }
};

/** Stats via efficient count query + price sum */
export const getStats = async (eventSlug = null) => {
  try {
    let countQuery = supabase.from(TABLE_NAME).select('*', { count: 'exact', head: true });
    let priceQuery = supabase.from(TABLE_NAME).select('price');

    if (eventSlug) {
      countQuery = countQuery.eq('event_id', eventSlug);
      priceQuery = priceQuery.eq('event_id', eventSlug);
    }

    const [{ count, error: cErr }, { data: priceData, error: pErr }] = await Promise.all([
      countQuery, priceQuery
    ]);

    if (cErr) throw cErr;
    if (pErr) throw pErr;

    const revenue = (priceData || []).reduce((sum, r) => sum + (parseFloat(r.price) || 0), 0);
    return { totalRegistrations: count || 0, revenue };
  } catch (error) {
    console.error('Error fetching stats', error);
    return { totalRegistrations: 0, revenue: 0 };
  }
};

export const exportToCSV = async (eventSlug) => {
  const data = await getRegistrations(eventSlug);
  if (!Array.isArray(data) || data.length === 0) {
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
  link.setAttribute("download", `registrations_${eventSlug || 'all'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** Get registration count for a specific category (for derived slot counts) */
export const getCategoryRegistrationCount = async (eventSlug, categoryName) => {
  try {
    const { count, error } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventSlug)
      .eq('category', categoryName)
      .neq('payment_status', 'CANCELLED');
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error counting category registrations', error);
    return 0;
  }
};
