import { supabase } from '../supabaseClient';

// TODO: [AUTH] Writes use the anon key, consistent with the rest of the admin panel.

/* ── FAQs ─────────────────────────────────────────────────────────────────── */

const FAQ_TABLE = 'faqs';

/** Public: published questions only. */
export const getPublishedFaqs = async () => {
  try {
    const { data, error } = await supabase
      .from(FAQ_TABLE)
      .select('*')
      .eq('is_published', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching FAQs', error);
    return [];
  }
};

/** Admin: everything, including unpublished. */
export const getAllFaqs = async () => {
  try {
    const { data, error } = await supabase
      .from(FAQ_TABLE)
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching FAQs', error);
    return [];
  }
};

export const addFaq = async (payload) => {
  const { data, error } = await supabase.from(FAQ_TABLE).insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const updateFaq = async (id, updates) => {
  const { data, error } = await supabase.from(FAQ_TABLE).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteFaq = async (id) => {
  const { error } = await supabase.from(FAQ_TABLE).delete().eq('id', id);
  if (error) throw error;
  return true;
};

export const reorderFaqs = async (orderedIds) => {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(FAQ_TABLE).update({ display_order: index }).eq('id', id)
    )
  );
};

/* ── Testimonials ─────────────────────────────────────────────────────────── */

const TESTIMONIAL_TABLE = 'testimonials';

/** Public: published quotes only. An empty result hides the whole section. */
export const getPublishedTestimonials = async () => {
  try {
    const { data, error } = await supabase
      .from(TESTIMONIAL_TABLE)
      .select('*')
      .eq('is_published', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching testimonials', error);
    return [];
  }
};

export const getAllTestimonials = async () => {
  try {
    const { data, error } = await supabase
      .from(TESTIMONIAL_TABLE)
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching testimonials', error);
    return [];
  }
};

export const addTestimonial = async (payload) => {
  const { data, error } = await supabase.from(TESTIMONIAL_TABLE).insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const updateTestimonial = async (id, updates) => {
  const { data, error } = await supabase.from(TESTIMONIAL_TABLE).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteTestimonial = async (id) => {
  const { error } = await supabase.from(TESTIMONIAL_TABLE).delete().eq('id', id);
  if (error) throw error;
  return true;
};

export const reorderTestimonials = async (orderedIds) => {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(TESTIMONIAL_TABLE).update({ display_order: index }).eq('id', id)
    )
  );
};
