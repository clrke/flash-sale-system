import type { SaleStatus } from '../api';
import { useCountdown } from '../hooks/useCountdown';

interface SaleStatusPanelProps {
  status: SaleStatus | null;
  connectionError: string | null;
}

/** Formats milliseconds as `m:ss`, or `h:mm:ss` once past an hour. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function SaleStatusPanel({ status, connectionError }: SaleStatusPanelProps) {
  // Hooks must run unconditionally, so this is computed before the early
  // returns below. Counts down to saleStart while upcoming, saleEnd once live.
  const targetIso = status ? (status.status === 'upcoming' ? status.saleStart : status.saleEnd) : undefined;
  const remainingMs = useCountdown(targetIso, status?.serverTime);

  if (connectionError && !status) {
    return (
      <div className="status-panel status-panel--error">
        <p>{connectionError}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="status-panel status-panel--loading">
        <p>Loading sale status...</p>
      </div>
    );
  }

  // "Nothing left to buy" has two causes - the clock ran out, or the stock
  // did (which can happen mid-window, before saleEnd) - and either way the
  // customer doesn't need the sold/remaining breakdown anymore, just that
  // it's over. Both get the same compact terminal card rather than a
  // stripped-down version of the active layout, which left an oddly empty
  // box (leftover header/spacing sized for content that's no longer shown).
  const isEnded = status.status === 'ended';
  const isSoldOut = status.remainingStock <= 0;
  if (isEnded || isSoldOut) {
    return (
      <div className="status-panel status-panel--ended-state">
        <span className={`status-badge status-badge--${isEnded ? 'ended' : 'soldout'}`}>
          {isEnded ? 'Ended' : 'Sold Out'}
        </span>
        <p className="status-panel__ended-message">
          {isEnded ? 'This flash sale has ended.' : 'This flash sale is sold out.'}
        </p>
      </div>
    );
  }

  // Below here the sale is active or upcoming with stock still available,
  // so the full status - badge, stock bar, live countdown - is meaningful.
  const percentRemaining = status.totalStock > 0
    ? Math.round((status.remainingStock / status.totalStock) * 100)
    : 0;
  const countdownLabel = status.status === 'upcoming' ? 'Starts in' : 'Ends in';
  const badgeLabel = status.status === 'upcoming' ? 'Upcoming' : 'Live';

  return (
    <div className="status-panel">
      <div className="status-panel__header">
        <span className={`status-badge status-badge--${status.status}`}>{badgeLabel}</span>
        <span className="status-panel__sold">{status.soldCount} sold</span>
      </div>

      <div className="stock-bar">
        <div
          className="stock-bar__fill"
          style={{ width: `${percentRemaining}%` }}
        />
      </div>
      <p className="stock-bar__label">
        {status.remainingStock} of {status.totalStock} remaining
      </p>

      <p className="countdown">
        <span className="countdown__label">{countdownLabel}</span>
        <span className="countdown__value">{formatCountdown(remainingMs)}</span>
      </p>
    </div>
  );
}
