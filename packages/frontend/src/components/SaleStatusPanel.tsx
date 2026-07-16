import type { SaleStatus } from '../api';
import { useCountdown } from '../hooks/useCountdown';

interface SaleStatusPanelProps {
  status: SaleStatus | null;
  connectionError: string | null;
}

const STATUS_LABELS: Record<SaleStatus['status'], string> = {
  upcoming: 'Upcoming',
  active: 'Live',
  ended: 'Ended',
};

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

  const percentRemaining = status.totalStock > 0
    ? Math.round((status.remainingStock / status.totalStock) * 100)
    : 0;

  const countdownLabel = status.status === 'upcoming' ? 'Starts in' : 'Ends in';

  return (
    <div className="status-panel">
      <div className="status-panel__header">
        <span className={`status-badge status-badge--${status.status}`}>
          {STATUS_LABELS[status.status]}
        </span>
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

      {status.status === 'ended' ? (
        <p className="countdown countdown--ended">Sale ended</p>
      ) : (
        <p className="countdown">
          <span className="countdown__label">{countdownLabel}</span>
          <span className="countdown__value">{formatCountdown(remainingMs)}</span>
        </p>
      )}
    </div>
  );
}
