import { getSupabase } from "./supabase";
import { cachedPendingIntent, readPendingIntent, removePendingIntent, usesNativePendingStorage, writePendingIntent } from "./pending-storage";
export { restorePendingIntents } from "./pending-storage";

const active = new Set<string>();
export class OperationSessionError extends Error {
  constructor() {
    super("Your signed-in account changed. Sign in to the original account to recover this operation.");
    this.name = "OperationSessionError";
  }
}
// One unresolved intent per actor/action. Android secures the tenant-bound
// request BEFORE the RPC and retains completed sales until receipt acknowledgement.
export async function operation<T>(actorId: string, name: string, parameters: Record<string, unknown>, tenantId?: string): Promise<T> {
  const slot = `${actorId}:${name}`;
  if (active.has(slot)) throw new Error("This operation is already being confirmed. Please wait.");
  active.add(slot);
  try {
    // Snapshot before async native I/O so an edited caller object cannot send a
    // different body from the one durably associated with this request key.
    const snapshot = JSON.parse(JSON.stringify(parameters)) as Record<string, unknown>;
    const original = await readPendingIntent(actorId, name, tenantId);
    const intent = original ?? { key: crypto.randomUUID(), ...(tenantId ? { tenantId } : {}), parameters: snapshot };
    if (original && JSON.stringify(intent.parameters) !== JSON.stringify(snapshot)) throw new Error("This request key belongs to a different operation");
    if (!original) await writePendingIntent(actorId, name, intent, tenantId);
    const sb = getSupabase();
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    const session = sessionData.session;
    if (sessionError || !session || session.user.id !== actorId || !session.access_token) throw new OperationSessionError();
    // PostgREST setHeader pins this request to the captured actor's token. The
    // SDK preserves an explicit Authorization header even if ambient auth changes.
    // The token never enters the pending record or storage.
    const { data, error } = await sb.rpc(name, { ...intent.parameters, p_request_id: intent.key }).setHeader("Authorization", `Bearer ${session.access_token}`);
    if (error) {
      // A later rejection cannot prove an earlier uncertain attempt failed.
      if (!original && (/^(22|23|40|42|P0)[0-9A-Z]{3}$/.test(error.code ?? "") || ["PGRST100", "PGRST202", "PGRST204"].includes(error.code ?? ""))) await removePendingIntent(actorId, name, intent.key, tenantId);
      throw error;
    }
    if (data === null || data === undefined) throw new Error("Could not confirm request");
    if (!(usesNativePendingStorage() && name === "stockflow_v2_sale")) await removePendingIntent(actorId, name, intent.key, tenantId);
    return data as T;
  } finally { active.delete(slot); }
}

export function pendingIntent(actorId: string, name: string, tenantId?: string): Record<string, unknown> | null {
  try { return cachedPendingIntent(actorId, name, tenantId)?.parameters ?? null; }
  catch { return null; }
}
export function pendingRequestId(actorId: string, name: string, tenantId?: string): string | null {
  try { return cachedPendingIntent(actorId, name, tenantId)?.key ?? null; }
  catch { return null; }
}
export async function acknowledgeSale(actorId: string, tenantId: string, requestId: string): Promise<void> {
  await removePendingIntent(actorId, "stockflow_v2_sale", requestId, tenantId);
}
