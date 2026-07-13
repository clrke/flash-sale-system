import type { SaleStatus } from '../api';

interface SaleStatusPanelProps {
  status: SaleStatus | null;
  connectionError: string | null;
}

const STATUS_LABELS: Record<SaleStatus['status'], string> = {
  upcoming: 'Upcoming',
  active: 'Live',
  ended: 'Ended',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SaleStatusPanel({ status, connectionError }: SaleStatusPanelProps) {
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

      <dl className="status-panel__times">
        <div>
          <dt>Starts</dt>
          <dd>{formatTime(status.saleStart)}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{formatTime(status.saleEnd)}</dd>
        </div>
      </dl>
    </div>
  );
}
