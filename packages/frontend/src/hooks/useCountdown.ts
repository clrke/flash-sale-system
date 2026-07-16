import { useEffect, useRef, useState } from 'react';

/**
 * Milliseconds remaining until `targetIso`, ticking once a second.
 *
 * Anchored to the server's clock rather than the browser's: `serverNowIso`
 * is a snapshot of `Date.now()` on the backend taken at the moment of the
 * last status poll. We capture the (server - local) offset whenever that
 * snapshot changes, then apply it to the browser's own clock for the
 * between-poll ticks. That keeps the countdown correct even if the
 * visitor's system clock is skewed, without needing a server round trip
 * every second.
 */
export function useCountdown(targetIso: string | undefined, serverNowIso: string | undefined): number {
  const offsetMsRef = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (serverNowIso) {
      offsetMsRef.current = Date.parse(serverNowIso) - Date.now();
    }
  }, [serverNowIso]);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!targetIso) return 0;
  const serverNowMs = Date.now() + offsetMsRef.current;
  return Math.max(0, Date.parse(targetIso) - serverNowMs);
}
