import { describe, it, expect } from "vitest";
import {
  minorUnits,
  cartTotal,
  lagosRange,
  parseProductsCsv,
  searchTerm,
} from "./domain";
describe("V2 business rules", () => {
  it("uses exact cents and rejects malformed prices", () => {
    expect(minorUnits("0.10") + minorUnits("0.20")).toBe(30);
    for (const v of ["1.005", "NaN", "-1", "1e3", ""])
      expect(() => minorUnits(v)).toThrow();
    expect(
      cartTotal([
        {
          product: {
            id: "1",
            name: "Item",
            buy_price: 0,
            sell_price: 0.1,
            warehouse_stock: 1,
            sku_code: null,
            is_active: true,
          },
          quantity: 3,
          price: "0.10",
        },
      ]),
    ).toBe(0.3);
  });
  it("periods use Lagos midnight across UTC date boundaries", () => {
    const r = lagosRange("today", new Date("2026-09-30T23:30:00Z"));
    expect(r.from).toBe("2026-09-30T23:00:00.000Z");
  });
  it("parses escaped CSV names and validates every row before submission", () => {
    const r = parseProductsCsv(
      'name,buy_price,sell_price,sku_code,opening_stock\r\n"Flour, 50kg",100,150,F50,10',
    );
    expect(r[0].name).toBe("Flour, 50kg");
    expect(r[0].opening_stock).toBe(10);
    expect(() =>
      parseProductsCsv(
        "name,buy_price,sell_price,sku_code\nGood,100,150,SAME\nBad,100,150,same",
      ),
    ).toThrow("duplicate SKU");
    expect(() =>
      parseProductsCsv("name,buy_price,sell_price\nGood,100,150\nBad,-1,150"),
    ).toThrow();
  });
  it("removes PostgREST filter control characters from search", () =>
    expect(searchTerm("flour),tenant_id.eq.other%")).not.toContain(")"));
});
