import { supabase } from '../supabaseClient';

/**
 * Registrations.
 *
 * Reads and writes here require an admin session. Migration 0006 removed the
 * anon role's access to this table entirely, because it holds dates of birth,
 * phone numbers, blood groups, emergency contacts and medical notes, and the
 * anon key is published inside the JavaScript bundle.
 *
 * The two things the public still needs -- creating an entry and checking
 * whether an email is taken -- go through SECURITY DEFINER functions that
 * return only what they must.
 */

const TABLE_NAME = 'registrations';

/**
 * Fetch registrations with optional server-side pagination + filtering.
 * When `options.page` is provided, returns `{ data, total }`.
 * Admin session required.
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

    if (search) {
      // Commas and parentheses are the separators in PostgREST's `or` syntax,
      // so a search for "Smith, A" would otherwise be parsed as extra filters
      // and reject the whole request.
      const safe = String(search).replace(/[,()]/g, ' ').trim();
      if (safe) {
        query = query.or(
          `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,bib.ilike.%${safe}%`
        );
      }
    }
    if (category) query = query.eq('category', category);
    if (status) query = query.eq('payment_status', status);

    if (usePagination) {
      const from = page * pageSize;
      query = query.range(from, from + pageSize - 1);
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

/**
 * Has this email already entered?
 *
 * Runs as a database function that answers yes or no and nothing else, so the
 * check cannot be turned into a way to enumerate who has signed up.
 * create_registration() enforces it again at insert time; this exists so the
 * runner hears about it on the details step rather than after signing waivers.
 */
export const isEmailRegistered = async (email, eventSlug) => {
  try {
    const { data, error } = await supabase.rpc('is_email_registered', {
      p_email: email,
      p_event_id: eventSlug,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    // Network trouble must not block the form; create_registration still
    // rejects a duplicate, and the unique index behind it is the real guard.
    console.error('Error checking existing registration', error);
    return false;
  }
};

/** What went wrong, in words a runner can act on. */
const REGISTRATION_ERRORS = {
  EVENT_NOT_FOUND: 'This event is no longer available.',
  REGISTRATION_CLOSED: 'Registration for this event has closed.',
  CATEGORY_NOT_FOUND: 'That category is no longer available. Please choose another.',
  CATEGORY_UNAVAILABLE: 'That category is not open for registration.',
  CATEGORY_FULL: 'That category just filled up. Please choose another.',
  DOB_REQUIRED: 'Please enter your date of birth.',
  DOB_INVALID: 'That date of birth does not look right.',
  UNDER_MIN_AGE: 'You do not meet the minimum age for that category.',
  WAIVERS_REQUIRED: 'Please accept all declarations before submitting.',
  EMAIL_INVALID: 'That email address does not look valid.',
  ALREADY_REGISTERED: 'This email is already registered for this event.',
};

/**
 * Create a registration.
 *
 * The price is NOT sent. The database reads it from event_categories, because
 * a value posted from the browser is a value the runner can edit. Eligibility,
 * capacity and the bib number are decided server-side for the same reason.
 */
export const addRegistration = async (registrationData) => {
  const payload = {
    first_name: registrationData.firstName,
    last_name: registrationData.lastName,
    email: registrationData.email,
    phone: registrationData.phone,
    dob: registrationData.dob,
    gender: registrationData.gender,

    blood_group: registrationData.bloodGroup,
    emergency_contact_name: registrationData.emergencyContactName,
    emergency_contact_number: registrationData.emergencyContactNumber,
    has_medical_condition: !!registrationData.hasMedicalCondition,
    allergies: registrationData.allergies,

    city: registrationData.city,
    state: registrationData.state,
    pincode: registrationData.pincode,
    club_name: registrationData.clubName || null,

    category: registrationData.category,
    tshirt_size: registrationData.tshirtSize,
    estimated_time: registrationData.estimatedTime,
    coupon_code: registrationData.couponCode || null,

    waivers_accepted: !!registrationData.waiversAccepted,
    event_id: registrationData.eventId,
  };

  const { data, error } = await supabase.rpc('create_registration', { payload });

  if (error) {
    console.error('Error saving registration', error);

    // PGRST202 means the function itself is not there. That is a deployment
    // mistake -- the frontend shipped without migration 0007 -- and it needs to
    // be obvious in the console rather than looking like a transient failure
    // someone should retry.
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      console.error(
        'create_registration() is missing from the database. Apply ' +
        'supabase/migrations/0007_registration_rpc.sql before deploying this build.'
      );
      const notDeployed = new Error(
        'Registration is temporarily unavailable. Please try again shortly, or contact the organisers.'
      );
      notDeployed.code = 'NOT_DEPLOYED';
      throw notDeployed;
    }

    // Postgres puts the raised code in `message`; match it to a sentence the
    // runner can act on, and keep the raw code for the analytics event.
    const code = Object.keys(REGISTRATION_ERRORS).find(k => error.message?.includes(k));
    const friendly = new Error(code ? REGISTRATION_ERRORS[code] : 'Something went wrong saving your registration. Please try again.');
    friendly.code = code || 'UNKNOWN';
    friendly.cause = error;
    throw friendly;
  }

  return data;
};

export const updateRegistration = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating registration', error);
    throw error;
  }
  return data;
};

/** Soft-delete: sets payment_status to CANCELLED */
export const deleteRegistration = async (id) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ payment_status: 'CANCELLED' })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error cancelling registration', error);
    throw error;
  }
  return data;
};

export const bulkUpdatePaymentStatus = async (ids, status) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ payment_status: status })
    .in('id', ids)
    .select();
  if (error) {
    console.error('Error bulk updating', error);
    throw error;
  }
  return data;
};

export const bulkDeleteRegistrations = async (ids) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ payment_status: 'CANCELLED' })
    .in('id', ids)
    .select();
  if (error) {
    console.error('Error bulk cancelling', error);
    throw error;
  }
  return data;
};

/**
 * Stats for the dashboard header.
 *
 * Revenue counts confirmed money only. Summing every row, cancelled entries
 * included, overstated takings -- and since payment is collected outside the
 * app, a PENDING entry is not revenue at all.
 */
export const getStats = async (eventSlug = null) => {
  try {
    let totalQuery = supabase.from(TABLE_NAME).select('*', { count: 'exact', head: true });
    let paidQuery = supabase.from(TABLE_NAME).select('price').eq('payment_status', 'PAID');
    let pendingQuery = supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'PENDING');

    if (eventSlug) {
      totalQuery = totalQuery.eq('event_id', eventSlug);
      paidQuery = paidQuery.eq('event_id', eventSlug);
      pendingQuery = pendingQuery.eq('event_id', eventSlug);
    }

    const [total, paid, pending] = await Promise.all([totalQuery, paidQuery, pendingQuery]);

    if (total.error) throw total.error;
    if (paid.error) throw paid.error;
    if (pending.error) throw pending.error;

    const revenue = (paid.data || []).reduce((sum, r) => sum + (parseFloat(r.price) || 0), 0);

    return {
      totalRegistrations: total.count || 0,
      paidCount: (paid.data || []).length,
      pendingCount: pending.count || 0,
      revenue,
    };
  } catch (error) {
    console.error('Error fetching stats', error);
    return { totalRegistrations: 0, paidCount: 0, pendingCount: 0, revenue: 0 };
  }
};

export const exportToCSV = async (eventSlug) => {
  const data = await getRegistrations(eventSlug);
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, message: 'No registrations to export.' };
  }

  const headers = [
    'Name', 'Email', 'Phone', 'Category', 'Bib Number', 'T-Shirt',
    'Blood Group', 'Emergency Contact', 'Emergency Number',
    'Medical Condition', 'Allergies',
    'City', 'State', 'Pincode', 'Club',
    'Price', 'Payment Status', 'Finish Status', 'Finish Time',
    'Waivers Accepted', 'Registered At',
  ];

  // A leading =, +, - or @ makes Excel treat the cell as a formula. A runner
  // called "=cmd" is unlikely, but the export lands on an organiser's laptop
  // and this costs one line.
  const cell = (value) => {
    if (value === null || value === undefined) return '""';
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = data.map(r => [
    cell(`${r.first_name || ''} ${r.last_name || ''}`.trim()),
    cell(r.email),
    cell(r.phone),
    cell(r.category),
    cell(r.bib),
    cell(r.tshirt_size),
    cell(r.blood_group),
    cell(r.emergency_contact_name),
    cell(r.emergency_contact_number),
    cell(r.has_medical_condition ? 'YES' : 'No'),
    cell(r.allergies),
    cell(r.city),
    cell(r.state),
    cell(r.pincode),
    cell(r.club_name),
    cell(r.price),
    cell(r.payment_status),
    cell(r.finish_status),
    cell(r.finish_time),
    cell(r.waivers_accepted ? 'Yes' : 'No'),
    cell(r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : ''),
  ]);

  const csvContent = [headers.map(cell).join(','), ...rows.map(e => e.join(','))].join('\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `registrations_${eventSlug || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { ok: true, count: data.length };
};

/**
 * Remaining slots per category, as counts.
 *
 * The previous version downloaded every registration row to count them in the
 * browser -- on the homepage, for anonymous visitors. That was both the data
 * leak and a needless full-table transfer on every page view.
 */
export const getCategoryAvailability = async (eventSlug) => {
  try {
    const { data, error } = await supabase.rpc('get_category_availability', {
      p_event_id: eventSlug,
    });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching category availability', error);
    return [];
  }
};

/** Published results for the public results board. Empty until published. */
export const getPublishedResults = async (eventSlug) => {
  try {
    const { data, error } = await supabase.rpc('get_published_results', {
      p_event_id: eventSlug,
    });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching results', error);
    return [];
  }
};
