// LexiCore Licensing — shared types
// Used by both the Desktop (V7) and Web (V7.1) tracks.
// Frozen baseline: V6.12.2 (no licensing — open/internal build).

export type ProductEdition = 'desktop-commercial' | 'desktop-demo' | 'web-commercial' | 'web-demo';

/** Desktop: single-device, offline, admin-signed activation key. */
export interface DesktopLicensePayload {
  v: 1;
  productId: 'LEXICORE_DESKTOP';
  edition: 'commercial' | 'demo';
  deviceId: string;          // hash produced by licensing/desktop machine fingerprint
  licenseId: string;         // unique id, e.g. LC7D-XXXXXXXX
  issuedAt: string;          // ISO timestamp
  expiresAt: string | null;  // null = perpetual (commercial). Demo always has a value.
  customerName?: string;
  notes?: string;
}

/** The activation key is the payload + an Ed25519 signature, base64url-encoded together. */
export interface DesktopActivationKey {
  payload: DesktopLicensePayload;
  signature: string; // base64url Ed25519 signature over canonical JSON of payload
}

/** Web: time-based subscription, validated server-side on every gated request. */
export type SubscriptionPlan = 'DAY' | 'WEEK' | 'MONTH';

export interface SubscriptionPricingIDR {
  plan: SubscriptionPlan;
  label: string;
  durationMs: number;
  priceIDR: number;
}

export interface WebSubscription {
  subscriptionId: string;
  customerId: string;       // maps to the web app's user/account id
  edition: 'commercial' | 'demo';
  plan: SubscriptionPlan | 'DEMO';
  startAt: string;          // ISO
  expiresAt: string;        // ISO — always set (even demo)
  priceIDR: number;         // 0 for demo
  status: 'active' | 'expired' | 'revoked';
  createdBy: 'payment-webhook' | 'admin' | 'system-demo';
}
