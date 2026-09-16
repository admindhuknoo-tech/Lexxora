// LexiCore Web (V7.1) — subscription persistence.
//
// This repo currently has no database (server/db.ts loads static reference
// JSON and otherwise keeps runtime state in memory — see AUDIT notes there).
// Subscriptions must survive a server restart, so this store uses a small
// JSON file as an honest, dependency-free starting point.
//
// SWAP BEFORE SCALING: for real traffic/multiple instances, replace the
// three functions below (load/save/init) with real Postgres/MySQL calls —
// everything else in web/*.ts only calls this module's exported functions,
// so that's the only file that needs to change.

import fs from 'fs';
import path from 'path';
import { shortId } from '../core/crypto';
import { PLANS, DEMO_DURATION_MS } from './plans';
import type { WebSubscription, SubscriptionPlan } from '../core/types';

const STORE_PATH = path.join(process.cwd(), 'data', 'subscriptions.json');

function load(): WebSubscription[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function save(all: WebSubscription[]): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 2), 'utf8');
}

/** The subscription currently governing access for this customer, if any. */
export function getActiveSubscription(customerId: string): WebSubscription | null {
  const all = load();
  const mine = all.filter((s) => s.customerId === customerId);
  mine.sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());
  const latest = mine[0];
  if (!latest) return null;
  if (latest.status === 'revoked') return latest;
  const expired = new Date(latest.expiresAt).getTime() <= Date.now();
  return expired ? { ...latest, status: 'expired' } : latest;
}

/** Called by the payment webhook (or an admin) once a plan purchase is confirmed. */
export function createSubscription(
  customerId: string,
  plan: SubscriptionPlan,
  createdBy: WebSubscription['createdBy'] = 'payment-webhook'
): WebSubscription {
  const all = load();
  const pricing = PLANS[plan];
  const now = Date.now();

  // Stacking: if the customer still has active time left, extend from there
  // instead of from now, so renewing early doesn't waste paid-for time.
  const current = getActiveSubscription(customerId);
  const base = current && current.status === 'active' ? new Date(current.expiresAt).getTime() : now;

  const sub: WebSubscription = {
    subscriptionId: shortId('SUB'),
    customerId,
    edition: 'commercial',
    plan,
    startAt: new Date(now).toISOString(),
    expiresAt: new Date(base + pricing.durationMs).toISOString(),
    priceIDR: pricing.priceIDR,
    status: 'active',
    createdBy,
  };
  all.push(sub);
  save(all);
  return sub;
}

/** Issues (or re-issues) a time-boxed free trial for a customer who hasn't had one. */
export function startDemoTrial(customerId: string): { ok: true; subscription: WebSubscription } | { ok: false; reason: string } {
  const all = load();
  const alreadyHadDemo = all.some((s) => s.customerId === customerId && s.edition === 'demo');
  if (alreadyHadDemo) return { ok: false, reason: 'Akun ini sudah pernah menggunakan masa percobaan.' };

  const now = Date.now();
  const sub: WebSubscription = {
    subscriptionId: shortId('DEMO'),
    customerId,
    edition: 'demo',
    plan: 'DEMO',
    startAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEMO_DURATION_MS).toISOString(),
    priceIDR: 0,
    status: 'active',
    createdBy: 'system-demo',
  };
  all.push(sub);
  save(all);
  return { ok: true, subscription: sub };
}

export function revokeSubscription(subscriptionId: string): void {
  const all = load();
  const idx = all.findIndex((s) => s.subscriptionId === subscriptionId);
  if (idx >= 0) {
    all[idx].status = 'revoked';
    save(all);
  }
}

export function listSubscriptions(customerId?: string): WebSubscription[] {
  const all = load();
  return customerId ? all.filter((s) => s.customerId === customerId) : all;
}
