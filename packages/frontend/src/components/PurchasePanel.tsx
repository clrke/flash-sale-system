import { useEffect, useState, type FormEvent } from 'react';
import { getSecured, purchase, type PurchaseResultStatus, type SaleStatus } from '../api';

interface PurchasePanelProps {
  status: SaleStatus | null;
  onPurchaseSettled: () => void;
}

type FeedbackKind = 'success' | 'info' | 'error' | 'warning';

interface Feedback {
  kind: FeedbackKind;
  text: string;
}

const FEEDBACK_BY_RESULT: Record<PurchaseResultStatus, Feedback> = {
  success: { kind: 'success', text: 'You secured an item!' },
  already_purchased: { kind: 'info', text: 'You already have an item.' },
  sold_out: { kind: 'error', text: 'Sold out.' },
  not_started: { kind: 'info', text: "The sale hasn't started yet." },
  ended: { kind: 'info', text: 'The sale has ended.' },
  invalid_user: { kind: 'warning', text: 'Please enter a User ID.' },
};

export function PurchasePanel({ status, onPurchaseSettled }: PurchasePanelProps) {
  const [userId, setUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [secured, setSecured] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const DEBOUNCE_MS = 300;

  useEffect(() => {
    const trimmed = userId.trim();

    // Reset immediately, before the debounce fires: a stale secured value
    // from whatever was previously typed must not keep saying "Already
    // Purchased" about a different identifier while the real check for the
    // new one is still in flight.
    setSecured(null);

    if (!trimmed) {
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await getSecured(trimmed);
        if (!cancelled) {
          setSecured(result.secured);
        }
      } catch {
        if (!cancelled) {
          setSecured(null);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId]);

  const isSaleActive = status?.status === 'active';
  const isSoldOut = status !== null && status.remainingStock <= 0;
  const trimmedUserId = userId.trim();
  const isDisabled = !trimmedUserId || isSubmitting || !isSaleActive || isSoldOut || isChecking;

  /**
   * The button always names the reason it's blocked (or the action it will
   * take), rather than a static "Buy Now" that goes stale once the sale
   * can't be acted on anymore. Priority: an in-flight request always wins;
   * next, anything specific to *this* user (already secured); then the
   * sale-wide reasons, most permanent first; "Checking..." only applies
   * once none of those more specific states are known yet.
   */
  function buyButtonLabel(): string {
    if (isSubmitting) return 'Processing...';
    if (secured) return 'Already Purchased';
    if (status?.status === 'upcoming') return 'Sale Not Started';
    if (status?.status === 'ended') return 'Sale Ended';
    if (isSoldOut) return 'Sold Out';
    if (isChecking) return 'Checking...';
    return 'Buy Now';
  }

  const handleUserIdChange = (value: string) => {
    setUserId(value);
    // A stale "Sold out." or "You already have an item." from a previous
    // identifier should not linger once someone starts typing a new one -
    // in a live demo that reads as the app being broken or confused.
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isDisabled) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await purchase(trimmedUserId);
      setFeedback(FEEDBACK_BY_RESULT[result.status]);
      if (result.secured) {
        setSecured(true);
      }
    } catch {
      setFeedback({ kind: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setIsSubmitting(false);
      onPurchaseSettled();
    }
  };

  return (
    <form className="purchase-panel" onSubmit={handleSubmit}>
      <label className="purchase-panel__label" htmlFor="userId">
        User ID
      </label>
      <input
        id="userId"
        type="text"
        className="purchase-panel__input"
        placeholder="e.g. jane@example.com"
        value={userId}
        onChange={(event) => handleUserIdChange(event.target.value)}
        disabled={isSubmitting}
        autoComplete="off"
        maxLength={64}
      />

      {secured !== null && (
        <p className="purchase-panel__secured-hint">
          {secured ? 'This user already holds an item.' : 'This user has not purchased yet.'}
        </p>
      )}

      <button type="submit" className="buy-button" disabled={isDisabled}>
        {buyButtonLabel()}
      </button>

      {feedback && (
        <p className={`feedback feedback--${feedback.kind}`} role="status">
          {feedback.text}
        </p>
      )}
    </form>
  );
}
