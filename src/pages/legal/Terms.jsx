import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';
import { ORGANISATION } from '../../utils/constants';

/**
 * Terms and conditions of entry.
 *
 * These restate, in full, the four declarations a runner ticks on the confirm
 * step -- medical fitness, assumption of risk, the refund position, and media
 * consent. A tick box that refers to terms the site does not publish is not
 * worth much if it is ever tested.
 *
 * NOT legal advice. Have it reviewed before launch.
 */
export default function Terms() {
  return (
    <LegalPage
      title="Terms and Conditions"
      description={`The terms on which ${ORGANISATION.name} accepts entries to the GODA Epic Trail Run.`}
      lastUpdated="2026-09-21"
    >
      <p>
        These terms apply to everyone who registers for the GODA Epic Trail Run,
        organised by {ORGANISATION.legalName} with {ORGANISATION.coOrganiser}. By
        completing a registration you accept them.
      </p>

      <h2>1. Entry</h2>
      <ul>
        <li>An entry is personal to you. It cannot be sold, given away or run under another person&apos;s name.</li>
        <li>Your place is reserved when you submit the form and confirmed only once payment has been received. Until then your entry is marked <strong>payment pending</strong>.</li>
        <li>We may decline or cancel an entry where the information given is false, where a category is full, or where a participant does not meet the stated minimum age.</li>
        <li>Each category has a minimum age, shown on the registration form and calculated from your date of birth. Entries below it are refused.</li>
        <li>Participants under 18 must be registered by a parent or guardian, who accepts these terms on their behalf.</li>
      </ul>

      <h2>2. Medical fitness</h2>
      <p>
        By registering you confirm that you are physically fit and have trained
        sufficiently for the distance you have entered, and that you are not aware
        of any medical condition that makes taking part unsafe. If you are in any
        doubt, see a doctor before entering.
      </p>
      <p>
        You must declare any relevant medical condition or allergy at registration
        so that the medical team can act on it. Withholding it puts you and the
        people trying to help you at risk.
      </p>

      <h2>3. Assumption of risk</h2>
      <div className="legal-callout">
        <p>
          <strong>Trail running carries real risk.</strong> The course runs over
          uneven natural ground, with climbs, descents, loose surfaces, water and
          wildlife, in weather that can change. Injury is possible and, in the worst
          case, so is death.
        </p>
      </div>
      <p>
        You take part voluntarily and at your own risk. To the fullest extent
        permitted by law, the organisers, their staff, volunteers, sponsors and
        partners are not liable for injury, illness, death, or loss of or damage to
        property arising from your participation, except where it results from
        their own gross negligence.
      </p>
      <p>
        We strongly recommend you hold your own personal accident and health
        insurance. Entry does not include it.
      </p>

      <h2>4. On the course</h2>
      <ul>
        <li>Follow the marked route, the instructions of marshals, and any cut-off times.</li>
        <li>Wear your bib visibly on your front for the whole race. It is how marshals identify you and how timing records you.</li>
        <li>Carry water. We recommend at least 500 ml between aid stations.</li>
        <li>Stop and seek help if you feel unwell. Tell a marshal if you retire, so we are not searching for you.</li>
        <li>Do not litter. Waste goes in the bins at aid stations.</li>
        <li>Headphones that block ambient sound, pacers who have not entered, and any form of wheeled or motorised assistance are not allowed.</li>
        <li>We may withdraw any participant on safety grounds, including for missing a cut-off or ignoring marshals.</li>
      </ul>

      <h2>5. Bib collection</h2>
      <p>
        Bibs are collected in person before race day at the time and place
        announced for the edition. Bring a government photo identity document.
        Collection times are published on the event page and emailed to registered
        participants.
      </p>

      <h2>6. Changes and cancellation by the organisers</h2>
      <p>
        We may alter the route, the start time, the cut-offs or the format where
        weather, ground conditions, safety, or an instruction from an authority
        makes it necessary. We will tell registered participants as early as we can.
      </p>
      <p>
        Where the event cannot be held at all, what happens to your entry fee is set
        out in the <Link to="/refund-policy">Cancellation and Refund Policy</Link>.
      </p>

      <h2>7. Results</h2>
      <p>
        Results are published once timings are verified, and show bib number, name,
        category, finish time and rank. We may correct a published result if an
        error in timing or scoring comes to light.
      </p>

      <h2>8. Photography and media</h2>
      <p>
        By registering you permit the organisers to photograph and film your
        participation, and to use that material to promote the event, without
        payment. If you would rather not appear, write to us and we will remove
        images of you from our own channels where we can identify them.
      </p>

      <h2>9. Personal information</h2>
      <p>
        How we handle what you give us is set out in the{' '}
        <Link to="/privacy-policy">Privacy Policy</Link>.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top of this page shows when they
        last changed. The version in force for your entry is the one published when
        you registered.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of India. The courts at{' '}
        {ORGANISATION.jurisdiction} have exclusive jurisdiction over any dispute.
      </p>

      <h2>12. Contact</h2>
      <p>
        <a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a> ·{' '}
        <a href={`tel:${ORGANISATION.phone.replace(/\s+/g, '')}`}>{ORGANISATION.phone}</a>
      </p>
    </LegalPage>
  );
}
