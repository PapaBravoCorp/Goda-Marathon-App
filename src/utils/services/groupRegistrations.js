import { supabase } from '../supabaseClient';

/**
 * Bulk (group) registrations.
 *
 * A club captain, company coordinator or school coach enters the whole team in
 * one submission. The group row holds the captain's contact details and the
 * money; each participant is an ordinary row in `registrations` pointing back
 * at it via `group_id`, so every existing feature -- bibs, results, the CSV
 * export, category counts -- keeps working without knowing groups exist.
 *
 * As with the solo flow, no price or discount is sent from the browser. The
 * client sends who is running and a coupon code; the database decides what
 * that is worth.
 */

/** Group-level failures, in words the captain can act on. */
const GROUP_ERRORS = {
  EVENT_NOT_FOUND: 'This event is no longer available.',
  REGISTRATION_CLOSED: 'Registration for this event has closed.',
  GROUP_TOO_SMALL: 'A group entry needs at least 2 participants. Use the individual form for one runner.',
  GROUP_TOO_LARGE: 'A single group entry is limited to 50 participants. Please submit the rest as a second group.',
  WAIVERS_REQUIRED: 'Please accept all declarations before submitting.',
  CAPTAIN_NAME_REQUIRED: 'Enter the group coordinator\'s name.',
  CAPTAIN_EMAIL_INVALID: 'The coordinator\'s email address does not look valid.',
  CAPTAIN_PHONE_REQUIRED: 'Enter the coordinator\'s phone number.',
};

/** Per-participant failures. `d` is the DETAIL the database attached. */
const PARTICIPANT_ERRORS = {
  PARTICIPANT_NAME_REQUIRED: () => 'Enter a first name.',
  PARTICIPANT_EMAIL_INVALID: () => 'Enter a valid email address.',
  DUPLICATE_EMAIL_IN_GROUP: (d) => `${d.email} appears more than once in this group.`,
  ALREADY_REGISTERED: (d) => `${d.email} is already registered for this event.`,
  DOB_REQUIRED: () => 'Enter a date of birth.',
  DOB_INVALID: () => 'That date of birth does not look right.',
  CATEGORY_NOT_FOUND: (d) => `"${d.category}" is no longer available. Choose another category.`,
  CATEGORY_UNAVAILABLE: (d) => `"${d.category}" is not open for registration.`,
  UNDER_MIN_AGE: (d) => `${d.category} is for runners aged ${d.min_age} and over.`,
};

/**
 * The database attaches structured DETAIL to per-participant failures so the
 * form can mark the offending row instead of showing one message over a list
 * of twenty people. Parsing is defensive: a malformed detail must degrade to a
 * plain message, not throw inside the error handler.
 */
const parseDetail = (error) => {
  try {
    const raw = error?.details ?? error?.detail;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Create the group and every participant in it.
 *
 * All or nothing: the database inserts the whole team in one transaction, so a
 * bad twentieth row never leaves nineteen entries behind and an invoice that
 * does not match the team.
 *
 * On a per-participant failure the thrown error carries `participantIndex` and
 * `participantName`, which the form uses to scroll to and highlight that row.
 */
export const createGroupRegistration = async ({
  eventId, captain, participants, couponCode, waiversAccepted,
}) => {
  const payload = {
    event_id: eventId,
    waivers_accepted: !!waiversAccepted,
    coupon_code: couponCode || null,
    captain: {
      first_name: captain.firstName,
      last_name: captain.lastName,
      email: captain.email,
      phone: captain.phone,
      organisation_name: captain.organisationName,
      city: captain.city,
      state: captain.state,
      pincode: captain.pincode,
      emergency_contact_name: captain.emergencyContactName,
      emergency_contact_number: captain.emergencyContactNumber,
    },
    participants: participants.map(p => ({
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email,
      phone: p.phone,
      dob: p.dob,
      gender: p.gender,
      blood_group: p.bloodGroup,
      category: p.category,
      tshirt_size: p.tshirtSize,
      // Optional per person; the database falls back to the captain's.
      emergency_contact_name: p.emergencyContactName || null,
      emergency_contact_number: p.emergencyContactNumber || null,
      has_medical_condition: !!p.hasMedicalCondition,
      allergies: p.allergies || null,
      estimated_time: p.estimatedTime || null,
    })),
  };

  const { data, error } = await supabase.rpc('create_group_registration', { payload });

  if (error) {
    console.error('Error saving group registration', error);

    // PGRST202 means the function is not there at all -- the frontend shipped
    // without migration 0010. That is a deployment mistake and needs to look
    // like one in the console, not like a transient failure worth retrying.
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      console.error(
        'create_group_registration() is missing from the database. Apply ' +
        'supabase/migrations/0010_group_registrations_and_coupons.sql before deploying this build.'
      );
      const notDeployed = new Error(
        'Group registration is temporarily unavailable. Please try again shortly, or contact the organisers.'
      );
      notDeployed.code = 'NOT_DEPLOYED';
      throw notDeployed;
    }

    const message = error.message || '';
    const detail = parseDetail(error);

    // Capacity is reported per category with the numbers attached, because
    // "that category is full" is not actionable when the captain asked for ten
    // places and three are left.
    if (message.includes('CATEGORY_FULL')) {
      const friendly = new Error(
        detail?.category
          ? `${detail.category} has only ${detail.slots_left} place${detail.slots_left === 1 ? '' : 's'} left, but you asked for ${detail.requested}.`
          : 'One of the categories just filled up. Please review your group.'
      );
      friendly.code = 'CATEGORY_FULL';
      friendly.category = detail?.category;
      friendly.cause = error;
      throw friendly;
    }

    const participantCode = Object.keys(PARTICIPANT_ERRORS).find(k => message.includes(k));
    if (participantCode && detail) {
      const friendly = new Error(
        `${detail.name || `Participant ${detail.index + 1}`}: ${PARTICIPANT_ERRORS[participantCode](detail)}`
      );
      friendly.code = participantCode;
      friendly.participantIndex = detail.index;
      friendly.participantName = detail.name;
      friendly.fieldMessage = PARTICIPANT_ERRORS[participantCode](detail);
      friendly.cause = error;
      throw friendly;
    }

    const groupCode = Object.keys(GROUP_ERRORS).find(k => message.includes(k));
    const friendly = new Error(
      groupCode
        ? GROUP_ERRORS[groupCode]
        : 'Something went wrong saving your group. Please try again.'
    );
    friendly.code = groupCode || 'UNKNOWN';
    friendly.cause = error;
    throw friendly;
  }

  return data;
};

/* ── Admin ──────────────────────────────────────────────────────────────── */

/**
 * Groups for the dashboard, each with a live member count.
 *
 * `active_count` is computed rather than read off the group row: cancelling one
 * member of a team leaves `participant_count` describing what was entered, not
 * what is still standing, and the organiser needs both.
 */
export const getRegistrationGroups = async (eventId) => {
  try {
    const { data, error } = await supabase.rpc('get_registration_groups', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching registration groups', error);
    return [];
  }
};

/** The members of one group. Admin session required. */
export const getGroupMembers = async (groupId) => {
  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('group_id', groupId)
      .order('bib', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching group members', error);
    return [];
  }
};

/**
 * Mark a whole group paid (or otherwise) in one action.
 *
 * A group pays once, so confirming twenty entries one at a time is both tedious
 * and a chance to leave three of them behind. The group row and its members are
 * kept in step.
 */
export const updateGroupPaymentStatus = async (groupId, status) => {
  const { error: groupError } = await supabase
    .from('registration_groups')
    .update({ payment_status: status })
    .eq('id', groupId);
  if (groupError) {
    console.error('Error updating group', groupError);
    throw groupError;
  }

  const { data, error } = await supabase
    .from('registrations')
    .update({ payment_status: status })
    .eq('group_id', groupId)
    .select();
  if (error) {
    console.error('Error updating group members', error);
    throw error;
  }
  return data;
};
