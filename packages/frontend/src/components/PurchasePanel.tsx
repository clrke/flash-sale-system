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
  invalid_user: { kind: 'warning', text: 'Please enter a user identifier.' },
};

export function PurchasePanel({ status, onPurchaseSettled }: PurchasePanelProps) {
  const [userId, setUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [secured, setSecured] = useState<boolean | null>(null);

  useEffect(() => {
    const trimmed = userId.trim();
    if (!trimmed) {
      setSecured(null);
      return;
    }

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
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId]);

  const isSaleActive = status?.status === 'active';
  const isSoldOut = status !== null && status.remainingStock <= 0;
  const trimmedUserId = userId.trim();
  const isDisabled = !trimmedUserId || isSubmitting || !isSaleActive || isSoldOut;

  /**
   * The button always names the reason it's blocked (or the action it will
   * take), rather than a static "Buy Now" that goes stale once the sale
   * can't be acted on anymore. Priority: an in-flight request always wins;
   * next, anything specific to *this* user (already secured); then the
   * sale-wide reasons, most permanent first.
   */
  function buyButtonLabel(): string {
    if (isSubmitting) return 'Processing...';
    if (secured) return 'Already Purchased';
    if (status?.status === 'upcoming') return 'Sale Not Started';
    if (status?.status === 'ended') return 'Sale Ended';
    if (isSoldOut) return 'Sold Out';
    return 'Buy Now';
  }

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
        User identifier
      </label>
      <input
        id="userId"
        type="text"
        className="purchase-panel__input"
        placeholder="username or email"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        disabled={isSubmitting}
        autoComplete="off"
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
