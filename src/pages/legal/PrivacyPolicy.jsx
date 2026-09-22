import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';
import { ORGANISATION } from '../../utils/constants';

/**
 * Privacy policy.
 *
 * Written to describe what this application actually does, field by field,
 * rather than generic boilerplate: the registration form asks for a date of
 * birth, a blood group, an emergency contact and any medical condition, and a
 * policy that does not mention health data would be describing a different
 * site.
 *
 * NOT legal advice. Have it reviewed before launch, and fill in the entity
 * details marked TODO in utils/constants.js.
 */
export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description={`How ${ORGANISATION.name} collects, uses and protects the personal information you provide when registering for the GODA Epic Trail Run.`}
      lastUpdated="2026-09-21"
    >
      <p>
        This policy explains what personal information {ORGANISATION.name} collects
        when you register for or visit the GODA Epic Trail Run website, why it is
        collected, who can see it, and what you can ask us to do with it.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <p>
        {ORGANISATION.legalName}, together with {ORGANISATION.coOrganiser}, organises
        the GODA Epic Trail Run and decides how your information is used. You can
        reach us at <a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a>{' '}
        or <a href={`tel:${ORGANISATION.phone.replace(/\s+/g, '')}`}>{ORGANISATION.phone}</a>.
      </p>

      <h2>2. What we collect</h2>
      <p>We collect only what the registration form asks for. Specifically:</p>

      <h3>Identification and contact</h3>
      <ul>
        <li>First and last name</li>
        <li>Email address</li>
        <li>Mobile number</li>
        <li>Date of birth</li>
        <li>Gender</li>
        <li>City, state and PIN code</li>
        <li>Running club or company name, if you choose to give one</li>
      </ul>

      <h3>Health and safety information</h3>
      <p>
        Trail running takes place away from roads and immediate medical access, so
        we ask for information a medical or rescue team would need if something
        goes wrong on the course:
      </p>
      <ul>
        <li>Blood group</li>
        <li>Emergency contact name and mobile number</li>
        <li>
          Whether you have a medical condition or allergy we should know about, and
          your description of it if you do
        </li>
      </ul>
      <p>
        This is health information, and we treat it as more sensitive than the
        rest. It is used for race-day safety and for nothing else. It is never used
        for marketing, never shared with sponsors, and never published.
      </p>

      <h3>Race information</h3>
      <ul>
        <li>Chosen category and T-shirt size</li>
        <li>Estimated finish time, if you give one, used to group start waves</li>
        <li>Any coupon or referral code you enter</li>
        <li>Your assigned bib number and, after the event, your finish time</li>
        <li>A record that you accepted the declarations, and when</li>
      </ul>

      <h3>Information collected automatically</h3>
      <p>
        Our hosting and database providers keep standard server logs, which include
        IP addresses and browser details, for security and troubleshooting. The
        site stores a draft of your part-completed registration in your own
        browser so you do not lose it if you navigate away; that draft never leaves
        your device and is cleared once you submit.
      </p>

      <h2>3. Why we use it</h2>
      <ul>
        <li><strong>To register you</strong> and issue a bib number.</li>
        <li><strong>To keep you safe</strong> on race day, by giving medical and rescue staff your blood group, emergency contact and declared conditions if they need them.</li>
        <li><strong>To contact you</strong> about payment, bib collection, route changes, timings and results.</li>
        <li><strong>To publish results</strong>, which show your bib number, name, category, finish time and rank, and nothing else.</li>
        <li><strong>To meet our obligations</strong> as event organisers, including insurance and any permissions required by local authorities.</li>
      </ul>
      <p>
        We do not sell your information, and we do not share it with third parties
        for their own marketing.
      </p>

      <h2>4. Who can see it</h2>
      <ul>
        <li><strong>Event organisers.</strong> A small number of named administrators, each signing in to a personal account.</li>
        <li><strong>Medical, physiotherapy and rescue teams</strong> on race day, limited to the safety information above.</li>
        <li><strong>Timing partners</strong>, limited to your bib number, name and category.</li>
        <li><strong>Our service providers</strong>, who host the website and database on our behalf and process data only on our instructions.</li>
        <li><strong>Authorities</strong>, where the law requires it.</li>
      </ul>

      <h2>5. Where it is stored</h2>
      <p>
        Registration data is held in a managed PostgreSQL database provided by
        Supabase, and photographs uploaded to the gallery are held in its file
        storage. These services may store data on servers outside India. Access is
        restricted to authenticated administrator accounts, enforced by the
        database itself rather than by the website alone.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li><strong>Registration and results records:</strong> kept while they are needed for event records, historical results and insurance purposes.</li>
        <li><strong>Health and emergency contact details:</strong> not needed once the event is over; ask us and we will remove them.</li>
        <li><strong>Newsletter addresses:</strong> kept until you ask to be removed.</li>
      </ul>

      <h2>7. Photography and video</h2>
      <p>
        Registration includes a declaration permitting us to use photographs and
        video of your participation to promote the event. If you would prefer not
        to appear in published material, write to us and we will remove images of
        you from our own channels where we can identify them.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Under India&apos;s Digital Personal Data Protection Act, 2023, you can ask us
        to:
      </p>
      <ul>
        <li>tell you what information we hold about you;</li>
        <li>correct anything that is wrong or out of date;</li>
        <li>delete your information, where we are not required to keep it;</li>
        <li>stop sending you email.</li>
      </ul>
      <p>
        Write to <a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a> from
        the address you registered with. We will respond within a reasonable period.
      </p>

      <h2>9. Children</h2>
      <p>
        Some categories are open to participants under 18. Where a participant is a
        minor, the registration must be completed by a parent or guardian, who
        accepts the declarations on their behalf.
      </p>

      <h2>10. Security</h2>
      <p>
        Traffic to this site is encrypted in transit. Participant records are not
        readable by the public: the database refuses to return them to anyone who
        is not signed in as an administrator. Administrator access is limited to an
        explicit list of accounts.
      </p>
      <p>
        No system is perfect. If we discover a breach affecting your data, we will
        tell you and the relevant authority as the law requires.
      </p>

      <h2>11. Changes</h2>
      <p>
        If this policy changes, the date at the top of this page changes with it.
        Material changes affecting registered participants will be emailed.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about this policy, or about your own data, go to{' '}
        <a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a>. See also
        our <Link to="/terms">Terms and Conditions</Link> and{' '}
        <Link to="/refund-policy">Cancellation and Refund Policy</Link>.
      </p>
    </LegalPage>
  );
}
