import { describe, expect, it } from "vitest";
import { Decimal, computeFee, fromProvider, parseMoney, sameAmount, toProviderNumber } from "../../src/modules/payments/money.js";
import { assertBalanced } from "../../src/modules/payments/ledger.js";

describe("money", () => {
  it("parses exact 2dp amounts and rejects float artefacts / negatives / junk", () => {
    expect(parseMoney("1500.50").toString()).toBe("1500.5");
    expect(parseMoney(2500).toString()).toBe("2500");
    for (const bad of [0, -5, "0", "1e3", "10.123", "abc", 0.1 + 0.2, null, undefined, ""]) {
      expect(() => parseMoney(bad as any)).toThrow();
    }
  });
  it("compares provider amounts without float drift", () => {
    expect(sameAmount(fromProvider("100.00"), new Decimal(100))).toBe(true);
    expect(sameAmount(fromProvider(99.99), new Decimal(100))).toBe(false);
    expect(sameAmount(null, new Decimal(1))).toBe(false);
    expect(toProviderNumber(new Decimal("1000.10"))).toBe(1000.1);
  });
  it("fee rounds DOWN to the kobo and net+fee always equals gross", () => {
    const gross = new Decimal("333.33");
    const fee = computeFee(gross, 250); // 2.5%
    expect(fee.toString()).toBe("8.33");
    expect(gross.sub(fee).add(fee).equals(gross)).toBe(true);
    expect(computeFee(gross, 0).toString()).toBe("0");
  });
});

describe("ledger balancing rule", () => {
  const d = (n: string) => new Decimal(n);
  it("accepts balanced transactions (incl. 3-way fee split)", () => {
    expect(() => assertBalanced([{ direction: "DEBIT", amount: d("100") }, { direction: "CREDIT", amount: d("90") }, { direction: "CREDIT", amount: d("10") }])).not.toThrow();
  });
  it("rejects unbalanced, single-sided, non-positive and >2dp entries", () => {
    expect(() => assertBalanced([{ direction: "DEBIT", amount: d("100") }, { direction: "CREDIT", amount: d("99.99") }])).toThrow(/Unbalanced/);
    expect(() => assertBalanced([{ direction: "DEBIT", amount: d("100") }])).toThrow();
    expect(() => assertBalanced([{ direction: "DEBIT", amount: d("0") }, { direction: "CREDIT", amount: d("0") }])).toThrow();
    expect(() => assertBalanced([{ direction: "DEBIT", amount: d("1.001") }, { direction: "CREDIT", amount: d("1.001") }])).toThrow();
  });
});
