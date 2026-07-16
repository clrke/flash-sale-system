import type { SaleStatus } from '../api';
import { useCountdown } from '../hooks/useCountdown';

interface SaleStatusPanelProps {
  status: SaleStatus | null;
  connectionError: string | null;
}

/**
 * Badge text/style for the non-ended states. Sold-out is not one of the
 * backend's three time-based `status` values (it can happen mid-window,
 * before `saleEnd`), so it is derived here from `remainingStock` and takes
 * priority over "Live". The "ended" state is handled separately below - it
 * gets its own compact layout rather than a stripped-down version of this
 * one, so it doesn't render as a mostly-empty box.
 */
function badge(status: SaleStatus): { label: string; modifier: string } {
  if (status.remainingStock <= 0) return { label: 'Sold Out', modifier: 'soldout' };
  if (status.status === 'upcoming') return { label: 'Upcoming', modifier: 'upcoming' };
  return { label: 'Live', modifier: 'active' };
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

  // Once the sale is over, how many sold / remained is no longer the
  // customer's business - just that it's over. Rather than hiding pieces of
  // the normal layout (which leaves an oddly empty box), the ended state
  // gets its own compact centered card.
  if (status.status === 'ended') {
    return (
      <div className="status-panel status-panel--ended-state">
        <span className="status-badge status-badge--ended">Ended</span>
        <p className="status-panel__ended-message">This flash sale has ended.</p>
      </div>
    );
  }

  const percentRemaining = status.totalStock > 0
    ? Math.round((status.remainingStock / status.totalStock) * 100)
    : 0;

  const isSoldOut = status.remainingStock <= 0;
  const countdownLabel = status.status === 'upcoming' ? 'Starts in' : 'Ends in';
  const { label: badgeLabel, modifier: badgeModifier } = badge(status);

  return (
    <div className="status-panel">
      <div className="status-panel__header">
        <span className={`status-badge status-badge--${badgeModifier}`}>{badgeLabel}</span>
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

      {isSoldOut ? (
        <p className="countdown countdown--ended">Sold out</p>
      ) : (
        <p className="countdown">
          <span className="countdown__label">{countdownLabel}</span>
          <span className="countdown__value">{formatCountdown(remainingMs)}</span>
        </p>
      )}
    </div>
  );
}
