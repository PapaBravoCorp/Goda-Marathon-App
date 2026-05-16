import { supabase } from '../supabaseClient';

// TODO: [AUTH] Replace anon-key writes with service_role via Edge Functions
// TODO: [SERVICE_ROLE] Move sendBulkEmail to Edge Function with Resend API key as secret
// TODO: [RLS] Restrict email_log to service_role only

const TABLE_NAME = 'email_log';

/** Email delivery states: QUEUED → SENDING → SENT | FAILED */
const EmailStatus = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
};

/**
 * Send bulk email with explicit state machine.
 * 1. Insert as QUEUED
 * 2. Mark as SENDING
 * 3. Call edge function
 * 4. Update to SENT or FAILED with error_message
 */
export const sendBulkEmail = async ({ subject, body, recipientFilter, recipientCount }) => {
  // Step 1: Insert as QUEUED
  const { data: logData, error: logError } = await supabase
    .from(TABLE_NAME)
    .insert([{
      subject,
      body,
      recipient_count: recipientCount,
      filter_criteria: recipientFilter,
      status: EmailStatus.QUEUED,
      sent_by: 'admin'
    }])
    .select()
    .single();

  if (logError) throw logError;
  const logId = logData.id;

  // Step 2: Mark as SENDING
  await updateEmailStatus(logId, EmailStatus.SENDING);

  // Step 3: Attempt edge function
  try {
    const { error: fnError } = await supabase.functions.invoke('send-bulk-email', {
      body: { subject, body, recipientFilter, logId }
    });

    if (fnError) throw fnError;

    // Step 4a: Success
    await updateEmailStatus(logId, EmailStatus.SENT);
    return { ...logData, status: EmailStatus.SENT };
  } catch (err) {
    // Step 4b: Failure — record the error, do NOT silently swallow
    const errorMessage = err?.message || 'Edge function unavailable or failed';
    await updateEmailStatus(logId, EmailStatus.FAILED, errorMessage);

    // Re-throw so the UI can show the failure
    const enrichedError = new Error(`Email delivery failed: ${errorMessage}`);
    enrichedError.logId = logId;
    enrichedError.status = EmailStatus.FAILED;
    throw enrichedError;
  }
};

/** Update email log status (used by state machine + retry) */
export const updateEmailStatus = async (id, status, errorMessage = null) => {
  try {
    const update = { status };
    if (errorMessage) update.error_message = errorMessage;

    const { error } = await supabase
      .from(TABLE_NAME)
      .update(update)
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('Error updating email status', error);
  }
};

/** Retry a failed email */
export const retryEmail = async (logId) => {
  try {
    // Fetch the original email data
    const { data: original, error: fetchErr } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', logId)
      .single();

    if (fetchErr) throw fetchErr;
    if (!original) throw new Error('Email log entry not found');

    // Reset to SENDING
    await updateEmailStatus(logId, EmailStatus.SENDING, null);

    // Retry the edge function
    try {
      const { error: fnError } = await supabase.functions.invoke('send-bulk-email', {
        body: {
          subject: original.subject,
          body: original.body,
          recipientFilter: original.filter_criteria,
          logId
        }
      });

      if (fnError) throw fnError;
      await updateEmailStatus(logId, EmailStatus.SENT);
      return { ...original, status: EmailStatus.SENT };
    } catch (err) {
      const errorMessage = err?.message || 'Retry failed';
      await updateEmailStatus(logId, EmailStatus.FAILED, errorMessage);
      throw new Error(`Retry failed: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error retrying email', error);
    throw error;
  }
};

export const getEmailLog = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('sent_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching email log', error);
    return [];
  }
};

export { EmailStatus };
