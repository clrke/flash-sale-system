import { useEffect, useRef, useState } from 'react';
import { getSaleStatus, type SaleStatus } from '../api';

const POLL_INTERVAL_MS = 2000;

interface UseSaleStatusResult {
  status: SaleStatus | null;
  error: string | null;
  refresh: () => void;
}

export function useSaleStatus(): UseSaleStatusResult {
  const [status, setStatus] = useState<SaleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const result = await getSaleStatus();
        if (!cancelled) {
          setStatus(result);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Having trouble connecting. Retrying...');
        }
      }
    };

    fetchStatus();

    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [tick]);

  const refresh = () => setTick((value) => value + 1);

  return { status, error, refresh };
}
