import { getSupabase } from "./supabase";

type Intent = { key: string; parameters: Record<string, unknown> };
// One unresolved intent per actor/action. An ambiguous timeout never creates a
// second request key. Kept in session-scoped storage to survive a page refresh.
export async function operation<T>(
  actorId: string,
  name: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const storageKey = `stockflow_v2_intent:${actorId}:${name}`;
  const raw = sessionStorage.getItem(storageKey);
  const intent: Intent = raw
    ? JSON.parse(raw)
    : { key: crypto.randomUUID(), parameters };
  if (raw && JSON.stringify(intent.parameters) !== JSON.stringify(parameters))
    throw new Error("This request key belongs to a different operation");
  sessionStorage.setItem(storageKey, JSON.stringify(intent));
  const { data, error } = await getSupabase().rpc(name, {
    ...intent.parameters,
    p_request_id: intent.key,
  });
  if (error) {
    // A definitive database rejection rolls back the transaction. Unknown
    // transport/5xx failures retain the key for a safe retry.
    if (
      error.code &&
      !["502", "503", "504"].includes(error.code) &&
      !/^5\d\d$/.test(error.code)
    )
      sessionStorage.removeItem(storageKey);
    throw error;
  }
  if (data === null || data === undefined)
    throw new Error("Could not confirm request");
  sessionStorage.removeItem(storageKey);
  return data as T;
}
export function pendingIntent(
  actorId: string,
  name: string,
): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(
      `stockflow_v2_intent:${actorId}:${name}`,
    );
    return raw ? JSON.parse(raw).parameters : null;
  } catch {
    return null;
  }
}
