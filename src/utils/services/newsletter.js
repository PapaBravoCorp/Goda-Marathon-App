import { supabase } from '../supabaseClient';

/**
 * Newsletter sign-ups.
 *
 * The footer form used to set a piece of React state to `true`, show
 * "Subscribed!" for five seconds, and throw the address away. Everyone who
 * signed up was told it had worked and then never heard anything, which is
 * worse than having no form at all.
 *
 * Writes go through a SECURITY DEFINER function rather than an insert, so a
 * visitor can add an address but cannot read the list back.
 */

export async function subscribe(email, source = 'footer') {
  const { error } = await supabase.rpc('subscribe_to_newsletter', {
    p_email: email,
    p_source: source,
  });

  if (error) {
    if (error.message?.includes('EMAIL_INVALID')) {
      const e = new Error('That email address does not look valid.');
      e.code = 'EMAIL_INVALID';
      throw e;
    }
    console.error('Newsletter subscribe failed', error);
    const e = new Error('Could not sign you up just now. Please try again.');
    e.code = 'UNKNOWN';
    throw e;
  }

  return true;
}

/** Admin only. */
export async function getSubscribers() {
  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching subscribers', error);
    return [];
  }
  return data || [];
}

/** Admin only. Marks someone as unsubscribed rather than deleting the row, so
 *  a later re-import cannot quietly add them back. */
export async function setSubscribed(id, isSubscribed) {
  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ is_subscribed: isSubscribed })
    .eq('id', id);
  if (error) throw error;
  return true;
}
