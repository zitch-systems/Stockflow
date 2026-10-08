import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ platform: "android", get: vi.fn(), put: vi.fn(), remove: vi.fn(), rpc: vi.fn(), getSession: vi.fn(), headers: [] as { name: string; value: string }[] }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => fixture.platform !== "web", getPlatform: () => fixture.platform },
  registerPlugin: () => ({ get: fixture.get, put: fixture.put, remove: fixture.remove }),
}));
vi.mock("./supabase", () => ({ getSupabase: () => ({
  auth: { getSession: fixture.getSession },
  rpc: (...args: unknown[]) => ({ setHeader: (name: string, value: string) => {
    fixture.headers.push({ name, value });
    return fixture.rpc(...args);
  } }),
}) }));

const tenant = "10000000-0000-4000-8000-000000000001";
const otherTenant = "10000000-0000-4000-8000-000000000002";
const actor = "20000000-0000-4000-8000-000000000001";
const otherActor = "20000000-0000-4000-8000-000000000002";
const name = "stockflow_v2_sale";
const body = { p_items: [{ product_id: "product", quantity: 1 }] };
const requestId = "40000000-0000-4000-8000-000000000001";
const otherRequestId = "40000000-0000-4000-8000-000000000002";
const key = `${actor}:${name}`;
const cacheKey = `stockflow_v2_intent:${key}`;
let durable: Map<string, string>;
let cache: Map<string, string>;
let actions: typeof import("./operations");
let storage: typeof import("./pending-storage");
async function reloadProcessModules() {
  vi.resetModules();
  storage = await import("./pending-storage");
  actions = await import("./operations");
}

beforeEach(async () => {
  fixture.platform = "android";
  for (const mock of [fixture.get, fixture.put, fixture.remove, fixture.rpc, fixture.getSession]) mock.mockReset();
  fixture.headers = [];
  fixture.getSession.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: "fixture-actor-token" } }, error: null });
  durable = new Map();
  cache = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value),
    removeItem: (key: string) => cache.delete(key),
  });
  fixture.get.mockImplementation(async ({ key }: { key: string }) => ({ value: durable.get(key) ?? null }));
  // Model the plugin's atomic non-overwrite and conditional-delete contract.
  // Encryption/Keystore behavior is tested by the separate Android tests.
  fixture.put.mockImplementation(async ({ key, value }: { key: string; value: string }) => {
    const existing = durable.get(key);
    if (existing !== undefined && existing !== value) throw Error("PENDING_STORAGE");
    durable.set(key, value);
  });
  fixture.remove.mockImplementation(async ({ key, requestId }: { key: string; requestId: string }) => {
    const existing = durable.get(key);
    if (existing && JSON.parse(existing).key !== requestId) throw Error("PENDING_STORAGE");
    durable.delete(key);
  });
  await reloadProcessModules();
});

describe("Android pending-operation durability (mocked native bridge)", () => {
  it("persists before the RPC and restores the same committed sale key after process/session-cache loss", async () => {
    const serverOperations = new Set<string>();
    let responseLost = true;
    fixture.rpc.mockImplementation(async (_name: string, params: { p_request_id: string }) => {
      expect(JSON.parse(durable.get(key)!).key).toBe(params.p_request_id);
      serverOperations.add(params.p_request_id);
      if (responseLost) { responseLost = false; return { data: null, error: { code: "NETWORK" } }; }
      return { data: "original-sale", error: null };
    });
    await expect(actions.operation(actor, name, body, tenant)).rejects.toEqual({ code: "NETWORK" });
    const originalId = JSON.parse(durable.get(key)!).key;
    cache.clear();
    await reloadProcessModules();
    expect(actions.pendingIntent(actor, name, tenant)).toBeNull();
    await storage.restorePendingIntents(actor, tenant);
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
    expect(await actions.operation(actor, name, body, tenant)).toBe("original-sale");
    expect(fixture.rpc.mock.calls.at(-1)![1].p_request_id).toBe(originalId);
    expect(serverOperations.size).toBe(1);
    expect(durable.has(key)).toBe(true);
    await actions.acknowledgeSale(actor, tenant, originalId);
    expect(durable.size).toBe(0);
    expect(actions.pendingIntent(actor, name, tenant)).toBeNull();
  });

  it("recovers every business action after process loss with its original request identity", async () => {
    for (const rpcName of ['stockflow_v2_submit_return','stockflow_v2_decide_return','stockflow_v2_receive_order','stockflow_v2_confirm_payment','stockflow_v2_reverse_payment']) {
      const slot = `${actor}:${rpcName}`;
      const parameters = { p_record_id: requestId, p_note: 'Fixture review' };
      fixture.rpc.mockResolvedValueOnce({data:null,error:{code:'NETWORK'}});
      await expect(actions.operation(actor,rpcName,parameters,tenant)).rejects.toEqual({code:'NETWORK'});
      const savedKey = JSON.parse(durable.get(slot)!).key;
      cache.clear();await reloadProcessModules();await storage.restorePendingIntents(actor,tenant);
      expect(actions.pendingIntent(actor,rpcName,tenant)).toEqual(parameters);
      await expect(actions.operation(actor,rpcName,{...parameters,p_note:'Changed'},tenant)).rejects.toThrow('different operation');
      fixture.rpc.mockResolvedValueOnce({data:{ok:true},error:null});
      expect(await actions.operation(actor,rpcName,parameters,tenant)).toEqual({ok:true});
      expect(fixture.rpc.mock.calls.at(-1)![1].p_request_id).toBe(savedKey);
      expect(durable.has(slot)).toBe(false);
    }
  });

  it("does not call the server if the native write is not acknowledged", async () => {
    fixture.put.mockRejectedValueOnce(Error("PENDING_STORAGE"));
    await expect(actions.operation(actor, name, body, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it("retains the original recovery key when successful-server cleanup fails", async () => {
    fixture.rpc.mockResolvedValue({ data: "original-sale", error: null });
    fixture.remove.mockRejectedValueOnce(Error("PENDING_STORAGE"));
    expect(await actions.operation(actor, name, body, tenant)).toBe("original-sale");
    const originalId = fixture.rpc.mock.calls[0][1].p_request_id;
    await expect(actions.acknowledgeSale(actor, tenant, originalId)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
    expect(JSON.parse(durable.get(key)!).key).toBe(originalId);
    cache.clear();
    await reloadProcessModules();
    await storage.restorePendingIntents(actor, tenant);
    expect(await actions.operation(actor, name, body, tenant)).toBe("original-sale");
    expect(fixture.rpc.mock.calls[1][1].p_request_id).toBe(originalId);
    await actions.acknowledgeSale(actor, tenant, originalId);
    expect(cache.size).toBe(0);
    expect(durable.size).toBe(0);
  });

  it("retains a successful sale through process death before the receipt can be acknowledged", async () => {
    const serverIds = new Set<string>();
    fixture.rpc.mockImplementation(async (_name: string, params: { p_request_id: string }) => {
      serverIds.add(params.p_request_id);
      return { data: "same-receipt", error: null };
    });
    expect(await actions.operation(actor, name, body, tenant)).toBe("same-receipt");
    const originalId = actions.pendingRequestId(actor, name, tenant);
    expect(originalId).toBeTruthy();
    expect(durable.has(key)).toBe(true);
    await reloadProcessModules();
    await storage.restorePendingIntents(actor, tenant);
    await expect(actions.operation(actor, name, { p_items: [] }, tenant)).rejects.toThrow("different operation");
    expect(await actions.operation(actor, name, body, tenant)).toBe("same-receipt");
    expect(serverIds.size).toBe(1);
    expect(actions.pendingRequestId(actor, name, tenant)).toBe(originalId);
    await actions.acknowledgeSale(actor, tenant, originalId!);
    expect(durable.size).toBe(0);
    expect(actions.pendingRequestId(actor, name, tenant)).toBeNull();
  });

  it("refuses replay or acknowledgement after the same actor is assigned to another tenant", async () => {
    durable.set(key, JSON.stringify({ key: requestId, tenantId: tenant, parameters: body }));
    await expect(storage.restorePendingIntents(actor, otherTenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    await expect(actions.operation(actor, name, body, otherTenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    await expect(actions.acknowledgeSale(actor, otherTenant, requestId)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(durable.get(key)!).tenantId).toBe(tenant);
    await storage.restorePendingIntents(actor, tenant);
    expect(actions.pendingRequestId(actor, name, tenant)).toBe(requestId);
  });

  it("blocks a changed actor after native persistence and preserves the original actor's request", async () => {
    fixture.put.mockImplementationOnce(async ({ key, value }: { key: string; value: string }) => {
      durable.set(key, value);
      fixture.getSession.mockResolvedValue({ data: { session: { user: { id: otherActor }, access_token: "other-actor-token" } }, error: null });
    });
    await expect(actions.operation(actor, name, body, tenant)).rejects.toBeInstanceOf(actions.OperationSessionError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    const originalId = JSON.parse(durable.get(key)!).key;
    fixture.getSession.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: "original-actor-token" } }, error: null });
    fixture.rpc.mockResolvedValueOnce({ data: "sale", error: null });
    await actions.operation(actor, name, body, tenant);
    expect(fixture.rpc.mock.calls[0][1].p_request_id).toBe(originalId);
    expect(fixture.headers).toEqual([{ name: "Authorization", value: "Bearer original-actor-token" }]);
    expect(durable.get(key)).not.toContain("original-actor-token");
    expect(Object.hasOwn(fixture.rpc.mock.calls[0][1], "tenantId")).toBe(false);
  });

  it("pins the checked actor token when the ambient session changes before the RPC is sent", async () => {
    fixture.getSession.mockImplementationOnce(async () => {
      fixture.getSession.mockResolvedValue({ data: { session: { user: { id: otherActor }, access_token: "changed-ambient-token" } }, error: null });
      return { data: { session: { user: { id: actor }, access_token: "checked-actor-token" } }, error: null };
    });
    fixture.rpc.mockImplementationOnce(async () => {
      expect((await fixture.getSession()).data.session.user.id).toBe(otherActor);
      expect(fixture.headers.at(-1)).toEqual({ name: "Authorization", value: "Bearer checked-actor-token" });
      return { data: "original-actor-sale", error: null };
    });
    expect(await actions.operation(actor, name, body, tenant)).toBe("original-actor-sale");
    expect(durable.get(key)).not.toContain("token");
  });

  it("sends the durably snapshotted body even if the caller edits its object during native I/O", async () => {
    const mutable = { p_items: [{ quantity: 1 }] };
    fixture.put.mockImplementationOnce(async ({ key, value }: { key: string; value: string }) => {
      durable.set(key, value);
      mutable.p_items[0].quantity = 99;
    });
    fixture.rpc.mockResolvedValueOnce({ data: null, error: { code: "NETWORK" } });
    await expect(actions.operation(actor, name, mutable, tenant)).rejects.toEqual({ code: "NETWORK" });
    expect(fixture.rpc.mock.calls[0][1].p_items).toEqual([{ quantity: 1 }]);
    expect(JSON.parse(durable.get(key)!).parameters.p_items).toEqual([{ quantity: 1 }]);
    const uiCopy = actions.pendingIntent(actor, name, tenant)!;
    (uiCopy.p_items as { quantity: number }[])[0].quantity = 42;
    expect(actions.pendingIntent(actor, name, tenant)!.p_items).toEqual([{ quantity: 1 }]);
  });

  it("retains a completed non-sale mutation when durable cleanup fails and safely retries it", async () => {
    const method = "stockflow_v2_customer";
    const customerBody = { p_name: "Fixture customer" };
    fixture.rpc.mockResolvedValue({ data: "same-customer", error: null });
    fixture.remove.mockRejectedValueOnce(Error("PENDING_STORAGE"));
    await expect(actions.operation(actor, method, customerBody, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    const originalId = fixture.rpc.mock.calls[0][1].p_request_id;
    expect(actions.pendingIntent(actor, method, tenant)).toEqual(customerBody);
    expect(await actions.operation(actor, method, customerBody, tenant)).toBe("same-customer");
    expect(fixture.rpc.mock.calls[1][1].p_request_id).toBe(originalId);
    expect(durable.size).toBe(0);
  });

  it("migrates an existing session intent before making an Android RPC", async () => {
    cache.set(cacheKey, JSON.stringify({ key: requestId, tenantId: tenant, parameters: body }));
    fixture.rpc.mockImplementation(async (_name: string, params: { p_request_id: string }) => {
      expect(JSON.parse(durable.get(key)!).key).toBe(requestId);
      expect(params.p_request_id).toBe(requestId);
      return { data: null, error: { code: "42501" } };
    });
    await expect(actions.operation(actor, name, body, tenant)).rejects.toEqual({ code: "42501" });
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
    expect(durable.has(key)).toBe(true);
  });

  it("hydrates only the authenticated actor's five operation slots", async () => {
    durable.set(key, JSON.stringify({ key: requestId, tenantId: tenant, parameters: body }));
    await storage.restorePendingIntents(otherActor, tenant);
    expect(cache.size).toBe(0);
    expect(fixture.get.mock.calls.map(([options]) => options.key)).toEqual(storage.PENDING_OPERATIONS.map((operation) => `${otherActor}:${operation}`));
    expect(durable.has(key)).toBe(true);
    await storage.restorePendingIntents(actor, tenant);
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
  });

  it("does not overwrite a different durable intent during concurrent writes or mismatched cleanup", async () => {
    const first = { key: requestId, tenantId: tenant, parameters: body };
    const second = { key: otherRequestId, tenantId: tenant, parameters: { p_items: [] } };
    const results = await Promise.allSettled([storage.writePendingIntent(actor, name, first, tenant), storage.writePendingIntent(actor, name, second, tenant)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(JSON.parse(durable.get(key)!)).toEqual(first);
    cache.clear();
    await expect(storage.removePendingIntent(actor, name, otherRequestId, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(JSON.parse(durable.get(key)!)).toEqual(first);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("fails closed if session and durable records disagree", async () => {
    durable.set(key, JSON.stringify({ key: requestId, tenantId: tenant, parameters: body }));
    cache.set(cacheKey, JSON.stringify({ key: otherRequestId, tenantId: tenant, parameters: body }));
    await expect(actions.operation(actor, name, body, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(durable.get(key)!).key).toBe(requestId);
    expect(JSON.parse(cache.get(cacheKey)!).key).toBe(otherRequestId);
  });

  it.each([
    "not-json",
    JSON.stringify({ key: requestId, parameters: body }),
    JSON.stringify({ key: requestId, tenantId: "not-a-tenant", parameters: body }),
    JSON.stringify({ key: "not-a-request-id", tenantId: tenant, parameters: body }),
    JSON.stringify({ key: requestId, tenantId: tenant, parameters: null }),
    JSON.stringify({ key: requestId, tenantId: tenant, parameters: [] }),
    JSON.stringify({ key: requestId, tenantId: tenant, parameters: { p_request_id: "client-override" } }),
  ])("refuses malformed durable intents instead of issuing a replacement request: %s", async (raw) => {
    durable.set(key, raw);
    await expect(storage.restorePendingIntents(actor, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    await expect(actions.operation(actor, name, body, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.put).not.toHaveBeenCalled();
    expect(durable.get(key)).toBe(raw);
  });

  it("does not use session-only fallback when native storage cannot be read", async () => {
    cache.set(cacheKey, JSON.stringify({ key: requestId, tenantId: tenant, parameters: body }));
    fixture.get.mockRejectedValue(Error("Native bridge unavailable"));
    await expect(storage.restorePendingIntents(actor, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    await expect(actions.operation(actor, name, body, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("uses only memory for the Android UI copy and never writes plaintext intent data to session storage", async () => {
    sessionStorage.setItem = () => { throw Error("Plaintext WebView writes are forbidden"); };
    fixture.rpc.mockResolvedValueOnce({ data: null, error: { code: "NETWORK" } });
    await expect(actions.operation(actor, name, body, tenant)).rejects.toEqual({ code: "NETWORK" });
    const originalId = JSON.parse(durable.get(key)!).key;
    expect(cache.size).toBe(0);
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
    await reloadProcessModules();
    expect(actions.pendingIntent(actor, name, tenant)).toBeNull();
    await storage.restorePendingIntents(actor, tenant);
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
    expect(JSON.parse(durable.get(key)!).key).toBe(originalId);
    expect(cache.size).toBe(0);
  });

  it("does not send the RPC until legacy plaintext migration cleanup succeeds", async () => {
    cache.set(cacheKey, JSON.stringify({ key: requestId, tenantId: tenant, parameters: body }));
    const removeItem = sessionStorage.removeItem;
    sessionStorage.removeItem = () => { throw Error("Storage cleanup unavailable"); };
    await expect(actions.operation(actor, name, body, tenant)).rejects.toBeInstanceOf(storage.PendingStorageError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(durable.get(key)!).key).toBe(requestId);
    expect(cache.has(cacheKey)).toBe(true);
    sessionStorage.removeItem = removeItem;
    await storage.restorePendingIntents(actor, tenant);
    expect(cache.size).toBe(0);
    fixture.rpc.mockResolvedValueOnce({ data: "sale", error: null });
    await actions.operation(actor, name, body, tenant);
    expect(fixture.rpc.mock.calls[0][1].p_request_id).toBe(requestId);
  });

  it.each(["web", "ios"])("retains session-scoped behavior on %s without calling the Android bridge", async (platform) => {
    fixture.platform = platform;
    fixture.rpc.mockResolvedValueOnce({ data: null, error: { code: "NETWORK" } });
    await expect(actions.operation(actor, name, body, tenant)).rejects.toEqual({ code: "NETWORK" });
    expect(actions.pendingIntent(actor, name, tenant)).toEqual(body);
    await storage.readPendingIntent(actor, name, tenant);
    expect(fixture.get).not.toHaveBeenCalled();
    expect(fixture.put).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
  });
});
