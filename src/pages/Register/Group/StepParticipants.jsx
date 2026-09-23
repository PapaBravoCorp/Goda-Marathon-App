import React from 'react';
import { UserPlus, AlertCircle } from 'lucide-react';

import { Button } from '../../../components/Button';
import ParticipantRow from './ParticipantRow';
import { MIN_PARTICIPANTS, MAX_PARTICIPANTS } from './groupHelpers';

/**
 * Step 2 — the roster.
 *
 * A running total sits alongside the list and follows the page, because the
 * number that decides whether a coordinator adds two more colleagues is the
 * one at the bottom, and hiding it until the confirm step means they get there
 * and go back.
 */
export default function StepParticipants({
  participants, errors, categories, categoryByName, perCategoryDemand,
  subtotal, captain, onChange, onAdd, onDuplicate, onRemove,
  onBack, onNext, formatCurrency,
}) {
  const atMax = participants.length >= MAX_PARTICIPANTS;
  const complete = participants.filter(p => p.category).length;

  return (
    <form onSubmit={onNext} className="space-y-8" noValidate>
      <div>
        <h2 className="reg-step-title">Who is running?</h2>
        <p className="reg-step-subtitle">
          Add every runner in your group. Each one gets their own bib number and
          result. Between {MIN_PARTICIPANTS} and {MAX_PARTICIPANTS} participants.
        </p>
      </div>

      {errors.roster && (
        <p className="reg-error reg-error--block" role="alert">
          <AlertCircle size={14} aria-hidden="true" /> {errors.roster}
        </p>
      )}

      <div className="grp-layout">
        <ol className="grp-rows">
          {participants.map((p, i) => (
            <ParticipantRow
              key={p._key}
              index={i}
              participant={p}
              errors={errors}
              categories={categories}
              captain={captain}
              onChange={onChange}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              canRemove={participants.length > 1}
              formatCurrency={formatCurrency}
            />
          ))}

          <li className="grp-add-row">
            <button type="button" className="grp-add-btn" onClick={onAdd} disabled={atMax}>
              <UserPlus size={18} aria-hidden="true" />
              {atMax
                ? `Maximum ${MAX_PARTICIPANTS} participants per group`
                : `Add participant ${participants.length + 1}`}
            </button>
            {atMax && (
              <p className="grp-add-note">
                Submit this group, then start a second one for the rest of your team.
              </p>
            )}
          </li>
        </ol>

        <aside className="grp-tally" aria-label="Group total so far">
          <h3 className="grp-tally-title">Your group</h3>

          <div className="grp-tally-count">
            <span className="grp-tally-count-value">{participants.length}</span>
            <span className="grp-tally-count-label">
              participant{participants.length === 1 ? '' : 's'}
            </span>
          </div>

          {perCategoryDemand.size > 0 ? (
            <ul className="grp-tally-list">
              {[...perCategoryDemand.entries()].map(([name, count]) => {
                const cat = categoryByName.get(name);
                const over = cat?.slotsLeft != null && count > cat.slotsLeft;
                return (
                  <li key={name} className={over ? 'is-over' : ''}>
                    <span className="grp-tally-cat">
                      {name} × {count}
                      {over && (
                        <span className="grp-tally-warn">
                          only {cat.slotsLeft} left
                        </span>
                      )}
                    </span>
                    <span>{formatCurrency((cat?.price || 0) * count)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="grp-tally-empty">Choose a category for each runner to see the total.</p>
          )}

          <div className="grp-tally-total">
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>

          {complete < participants.length && (
            <p className="grp-tally-pending">
              {participants.length - complete} runner
              {participants.length - complete === 1 ? ' still needs' : 's still need'} a category.
            </p>
          )}

          <p className="grp-tally-note">
            Have a discount code? Apply it on the next step.
          </p>
        </aside>
      </div>

      <div className="reg-actions">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary">Review &amp; apply discount</Button>
      </div>
    </form>
  );
}
