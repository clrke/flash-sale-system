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
