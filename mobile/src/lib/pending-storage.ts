import { Capacitor, registerPlugin } from "@capacitor/core";

export type PendingIntent = { key: string; tenantId?: string; parameters: Record<string, unknown> };
export const PENDING_OPERATIONS = ["stockflow_v2_sale", "stockflow_v2_product", "stockflow_v2_customer", "stockflow_v2_adjust_stock", "stockflow_v2_import_products"] as const;
interface PendingBridge {
  get(options: { key: string }): Promise<{ value: string | null }>;
  put(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string; requestId: string }): Promise<void>;
}
const bridge = registerPlugin<PendingBridge>("StockFlowPending");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 262144;
// Android's synchronous UI copy stays in memory, never plaintext WebView storage.
const memory = new Map<string, PendingIntent>();

export class PendingStorageError extends Error {
  constructor() {
    super("StockFlow could not safely save or recover this pending operation. Keep this app’s data and try again. Do not create a replacement transaction.");
    this.name = "PendingStorageError";
  }
}
export function usesNativePendingStorage() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
function keyFor(actorId: string, operation: string, tenantId?: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(actorId) || !PENDING_OPERATIONS.includes(operation as typeof PENDING_OPERATIONS[number]) || (tenantId !== undefined && !/^[a-zA-Z0-9_-]+$/.test(tenantId)) || (usesNativePendingStorage() && (!UUID.test(actorId) || !tenantId || !UUID.test(tenantId)))) throw new PendingStorageError();
  return `${actorId}:${operation}`;
}
function cacheKey(key: string) { return `stockflow_v2_intent:${key}`; }
function parse(raw: string, tenantId?: string): PendingIntent {
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new PendingStorageError();
  let intent: unknown;
  try { intent = JSON.parse(raw); } catch { throw new PendingStorageError(); }
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) throw new PendingStorageError();
  const record = intent as Partial<PendingIntent>;
  const keys = Object.keys(record).sort().join(",");
  if (!["key,parameters", "key,parameters,tenantId"].includes(keys) || typeof record.key !== "string" || !UUID.test(record.key) || !record.parameters || typeof record.parameters !== "object" || Array.isArray(record.parameters) || Object.hasOwn(record.parameters, "p_request_id")) throw new PendingStorageError();
  if (record.tenantId !== undefined && (typeof record.tenantId !== "string" || record.tenantId !== tenantId)) throw new PendingStorageError();
  // Missing historical tenant context cannot safely be guessed after a user's
  // business assignment changes. Those records require reconciliation.
  if (usesNativePendingStorage() && (!record.tenantId || !UUID.test(record.tenantId) || record.tenantId !== tenantId)) throw new PendingStorageError();
  return record as PendingIntent;
}
function encode(intent: PendingIntent, tenantId?: string) {
  try { const raw = JSON.stringify(intent); parse(raw, tenantId); return raw; }
  catch { throw new PendingStorageError(); }
}
function same(left: PendingIntent, right: PendingIntent) {
  return left.key === right.key && left.tenantId === right.tenantId && JSON.stringify(left.parameters) === JSON.stringify(right.parameters);
}
function sessionIntent(key: string, tenantId?: string) {
  const raw = sessionStorage.getItem(cacheKey(key));
  return raw === null ? null : parse(raw, tenantId);
}
function assertCompatible(left: PendingIntent | null | undefined, right: PendingIntent) {
  if (left && !same(left, right)) throw new PendingStorageError();
}
function acceptAndroid(key: string, intent: PendingIntent, tenantId?: string) {
  assertCompatible(memory.get(key), intent);
  const legacy = sessionIntent(key, tenantId);
  assertCompatible(legacy, intent);
  // Run only after native durability is confirmed. Cleanup failure rejects
  // before any RPC, retaining the original encrypted request.
  if (legacy) sessionStorage.removeItem(cacheKey(key));
  memory.set(key, parse(encode(intent, tenantId), tenantId));
}
export function cachedPendingIntent(actorId: string, operation: string, tenantId?: string): PendingIntent | null {
  const key = keyFor(actorId, operation, tenantId);
  const intent = usesNativePendingStorage() ? memory.get(key) ?? null : sessionIntent(key, tenantId);
  return intent ? parse(encode(intent, tenantId), tenantId) : null;
}

// Android never silently falls back when the encrypted bridge is unavailable.
export async function readPendingIntent(actorId: string, operation: string, tenantId?: string): Promise<PendingIntent | null> {
  try {
    const key = keyFor(actorId, operation, tenantId);
    if (!usesNativePendingStorage()) return sessionIntent(key, tenantId);
    const legacy = sessionIntent(key, tenantId);
    const cached = memory.get(key) ?? null;
    if (legacy) assertCompatible(cached, legacy);
    const result = await bridge.get({ key });
    if (!result || (result.value !== null && typeof result.value !== "string")) throw new PendingStorageError();
    const durable = result.value === null ? null : parse(result.value, tenantId);
    if (durable) {
      assertCompatible(cached, durable);
      assertCompatible(legacy, durable);
      acceptAndroid(key, durable, tenantId);
      return parse(encode(durable, tenantId), tenantId);
    }
    const previous = cached ?? legacy;
    if (previous) {
      // Migrate only a matching tenant-bound legacy intent; never infer tenant.
      await bridge.put({ key, value: encode(previous, tenantId) });
      acceptAndroid(key, previous, tenantId);
      return parse(encode(previous, tenantId), tenantId);
    }
    return null;
  } catch { throw new PendingStorageError(); }
}
export async function writePendingIntent(actorId: string, operation: string, intent: PendingIntent, tenantId?: string): Promise<void> {
  try {
    const key = keyFor(actorId, operation, tenantId);
    const raw = encode(intent, tenantId);
    assertCompatible(cachedPendingIntent(actorId, operation, tenantId), intent);
    if (usesNativePendingStorage()) {
      assertCompatible(sessionIntent(key, tenantId), intent);
      await bridge.put({ key, value: raw });
      acceptAndroid(key, intent, tenantId);
    } else sessionStorage.setItem(cacheKey(key), raw);
  } catch { throw new PendingStorageError(); }
}
export async function removePendingIntent(actorId: string, operation: string, requestId: string, tenantId?: string): Promise<void> {
  try {
    const key = keyFor(actorId, operation, tenantId);
    if (!UUID.test(requestId)) throw new PendingStorageError();
    const requireMatchingKey = (intent: PendingIntent | null | undefined) => {
      if (intent && intent.key !== requestId) throw new PendingStorageError();
    };
    if (usesNativePendingStorage()) {
      // Acknowledge only within the current authoritative business, including
      // after a process restart where no synchronous UI cache exists yet.
      requireMatchingKey(await readPendingIntent(actorId, operation, tenantId));
      await bridge.remove({ key, requestId });
      requireMatchingKey(memory.get(key));
      const legacy = sessionIntent(key, tenantId);
      requireMatchingKey(legacy);
      if (legacy) sessionStorage.removeItem(cacheKey(key));
      memory.delete(key);
    } else {
      requireMatchingKey(cachedPendingIntent(actorId, operation, tenantId));
      sessionStorage.removeItem(cacheKey(key));
    }
  } catch { throw new PendingStorageError(); }
}
export async function restorePendingIntents(actorId: string, tenantId?: string): Promise<void> {
  for (const operation of PENDING_OPERATIONS) await readPendingIntent(actorId, operation, tenantId);
}
