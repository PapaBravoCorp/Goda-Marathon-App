import { useState, useRef, useCallback } from 'react';
import { payForEntry, recheckPayment, cancelReservation } from '../../utils/services/payments';

/** Cancel answers that leave the runner on the payment step, in words. */
const CANCEL_REFUSALS = {
  NOT_CANCELLABLE: 'This reservation can no longer be cancelled online. Please contact the organisers.',
  CANCEL_AS_GROUP: 'This runner is part of a group entry. The group coordinator can cancel the whole group.',
};

/**
 * The payment step's state, shared by the solo and group flows.
 *
 * Phases:
 *   idle        ready to pay (first visit, or after closing Checkout)
 *   starting    creating the order / loading Checkout
 *   paying      Checkout is open; the runner is paying
 *   verifying   Razorpay says paid; our server is confirming
 *   paid        confirmed
 *   failed      declined, window closed -- can try again
 *   error       could not start -- can try again
 *   processing  paid, bank still confirming (UPI) -- check again, do NOT pay again
 *   unverified  paid, our check could not run -- check again, do NOT pay again
 *   refund      paid, but the entry could not take it -- contact organisers
 *   expired     reservation lapsed -- start again
 *   offline     online payment was switched off -- organisers will collect
 *   cancelling  releasing the reservation at the runner's request
 *
 * `processing` and `unverified` deliberately offer no Pay button. The money
 * has most likely left the runner's account; a second button invites a
 * second payment.
 */
export default function usePayment() {
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [paymentId, setPaymentId] = useState(null);
  const responseRef = useRef(null);

  const apply = useCallback((outcome) => {
    if (outcome.response) responseRef.current = outcome.response;
    setPaymentId(outcome.paymentId || null);

    switch (outcome.outcome) {
      case 'paid':
        setPhase('paid');
        setMessage('');
        break;
      case 'dismissed':
        setPhase('idle');
        setMessage('Payment was not completed. Your place is still held — you can pay now.');
        break;
      case 'failed':
        // Not "no money was taken": with UPI the bank can debit the runner and
        // Razorpay can still fail the payment afterwards. Razorpay reverses
        // those automatically, and saying so stops a second payment made in
        // panic.
        setPhase('failed');
        setMessage(`${outcome.message} If any money was deducted, it is refunded to you automatically. You can try again with another card or UPI app.`);
        break;
      default:
        setPhase(outcome.outcome);
        setMessage(outcome.message || '');
    }
    return outcome;
  }, []);

  const pay = useCallback(async (args) => {
    setPhase('starting');
    setMessage('');
    try {
      return apply(await payForEntry({
        ...args,
        onOpen: () => setPhase('paying'),
        onVerifying: () => setPhase('verifying'),
      }));
    } catch (err) {
      const phaseFor = {
        EXPIRED: 'expired',
        NOT_PAYABLE: 'expired',
        NOT_FOUND: 'expired',
        DISABLED: 'offline',
      };
      setPhase(phaseFor[err.code] || 'error');
      setMessage(err.message);
      return { outcome: 'error', code: err.code, message: err.message, error: err };
    }
  }, [apply]);

  const recheck = useCallback(async () => {
    if (!responseRef.current) return null;
    setPhase('verifying');
    return apply(await recheckPayment(responseRef.current));
  }, [apply]);

  /**
   * Release the reservation. Resolves with the database's status so the page
   * can move on (CANCELLED, NOT_FOUND), or show the confirmation (PAID). A
   * refusal or a failed call keeps the runner on the payment step with the
   * reason shown.
   */
  const cancel = useCallback(async (target) => {
    setPhase('cancelling');
    setMessage('');
    try {
      const result = await cancelReservation(target);
      const status = result?.status;
      if (status in CANCEL_REFUSALS) {
        setPhase('failed');
        setMessage(CANCEL_REFUSALS[status]);
      }
      return result || { status: 'UNKNOWN' };
    } catch (err) {
      setPhase('failed');
      setMessage(err.message);
      return { status: 'ERROR' };
    }
  }, []);

  const reset = useCallback(() => {
    responseRef.current = null;
    setPhase('idle');
    setMessage('');
    setPaymentId(null);
  }, []);

  return { phase, message, paymentId, pay, recheck, cancel, reset };
}
