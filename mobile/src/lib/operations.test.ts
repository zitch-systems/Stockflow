import { beforeEach, describe, expect, it, vi } from "vitest";
import { operation, pendingIntent } from "./operations";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({ getSupabase: () => ({ rpc }) }));
const actor = "owner", name = "stockflow_v2_sale", body = { p_items: [{ quantity: 1 }] };
beforeEach(() => {
  rpc.mockReset();
  const values = new Map<string,string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key:string) => values.get(key) ?? null,
    setItem: (key:string,value:string) => values.set(key,value),
    removeItem: (key:string) => values.delete(key),
  });
});
describe("transaction uncertainty", () => {
  it("coded transport failures retry the original key, never a new transaction", async () => {
    for (const code of ["NETWORK", "PGRST000", "503"]) {
      rpc.mockResolvedValueOnce({ data:null,error:{code} });
      await expect(operation(actor,name,body)).rejects.toEqual({code});
      expect(pendingIntent(actor,name)).toEqual(body);
      const key=rpc.mock.calls.at(-1)![1].p_request_id;
      rpc.mockResolvedValueOnce({data:"original-sale",error:null});
      expect(await operation(actor,name,body)).toBe("original-sale");
      expect(rpc.mock.calls.at(-1)![1].p_request_id).toBe(key);
      expect(pendingIntent(actor,name)).toBeNull();
    }
  });
  it("reauthentication rejection after a lost response preserves recovery identity", async () => {
    rpc.mockResolvedValueOnce({data:null,error:{code:"NETWORK"}});
    await expect(operation(actor,name,body)).rejects.toBeTruthy();
    const key=rpc.mock.calls.at(-1)![1].p_request_id;
    rpc.mockResolvedValueOnce({data:null,error:{code:"42501"}});
    await expect(operation(actor,name,body)).rejects.toBeTruthy();
    expect(pendingIntent(actor,name)).toEqual(body);
    rpc.mockResolvedValueOnce({data:"original-sale",error:null});
    await operation(actor,name,body);
    expect(rpc.mock.calls.at(-1)![1].p_request_id).toBe(key);
  });
  it("first-attempt rollback allows correcting a rejected cart", async () => {
    rpc.mockResolvedValueOnce({data:null,error:{code:"P0001"}});
    await expect(operation(actor,name,body)).rejects.toBeTruthy();
    expect(pendingIntent(actor,name)).toBeNull();
    const key=rpc.mock.calls.at(-1)![1].p_request_id;
    rpc.mockResolvedValueOnce({data:"corrected-sale",error:null});
    await operation(actor,name,{p_items:[{quantity:2}]});
    expect(rpc.mock.calls.at(-1)![1].p_request_id).not.toBe(key);
  });
});
