export type SaleState = 'upcoming' | 'active' | 'ended';

export interface ProductInfo {
  name: string;
  tagline: string;
  price: string;
  imageUrl: string;
}

export interface SaleStatus {
  status: SaleState;
  product: ProductInfo;
  totalStock: number;
  remainingStock: number;
  soldCount: number;
  saleStart: string;
  saleEnd: string;
  serverTime: string;
}

export type PurchaseResultStatus =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_started'
  | 'ended'
  | 'invalid_user';

export interface PurchaseResult {
  status: PurchaseResultStatus;
  secured: boolean;
  error?: string;
}

export interface SecuredResult {
  userId: string;
  secured: boolean;
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  // 4xx here is a deliberate business outcome, not a failure: the purchase
  // endpoint returns 409 for sold_out/not_started/ended and 400 for
  // invalid_user, each with a body already shaped like PurchaseResult, so
  // callers parse those normally via result.status. A 5xx, in contrast,
  // means an uncaught exception hit Fastify's default error handler, which
  // returns {statusCode, error, message} - a shape that matches none of
  // SaleStatus/PurchaseResult/SecuredResult. Without this check that body
  // would be parsed and returned as if it were valid data (fetch() only
  // rejects on network failure, never on HTTP status), silently corrupting
  // UI state instead of surfacing through the existing error/catch paths.
  if (response.status >= 500) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getSaleStatus(): Promise<SaleStatus> {
  return requestJson<SaleStatus>('/api/sale/status');
}

export function purchase(userId: string): Promise<PurchaseResult> {
  return requestJson<PurchaseResult>('/api/sale/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

export function getSecured(userId: string): Promise<SecuredResult> {
  const params = new URLSearchParams({ userId });
  return requestJson<SecuredResult>(`/api/sale/secured?${params.toString()}`);
}
