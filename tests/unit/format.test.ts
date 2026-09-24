import { describe, expect, it } from "vitest";
import { convertToUSD, formatUSD, isSuspiciousMove, round3sig } from "../../src/format";

describe("formatUSD", () => {
  it("formats trillions with 3 sig figs", () => {
    expect(formatUSD(3_420_000_000_000)).toBe("$3.42T");
    expect(formatUSD(4_100_000_000_000)).toBe("$4.1T");
  });
  it("formats billions and millions", () => {
    expect(formatUSD(812_000_000_000)).toBe("$812B");
    expect(formatUSD(4_700_000_000)).toBe("$4.7B");
    expect(formatUSD(950_000_000)).toBe("$950M");
  });
  it("handles bad input", () => {
    expect(formatUSD(0)).toBe("$—");
    expect(formatUSD(NaN)).toBe("$—");
    expect(formatUSD(-5)).toBe("$—");
  });
});

describe("round3sig", () => {
  it("rounds to 3 significant figures", () => {
    expect(round3sig(3_428_000_000_000)).toBe(3_430_000_000_000);
    expect(round3sig(812_345_678)).toBe(812_000_000);
    expect(round3sig(0)).toBe(0);
  });
});

describe("convertToUSD", () => {
  it("passes USD through", () => {
    expect(convertToUSD(100, "USD", {})).toBe(100);
  });
  it("converts via direct EURUSD quote", () => {
    expect(convertToUSD(100, "EUR", { EURUSD: 1.1 })).toBeCloseTo(110);
  });
  it("converts via indirect USDTRY quote", () => {
    expect(convertToUSD(3400, "TRY", { USDTRY: 34 })).toBeCloseTo(100);
  });
  it("handles GBp pence", () => {
    expect(convertToUSD(10_000, "GBp", { GBPUSD: 1.27 })).toBeCloseTo(127);
  });
  it("returns null without an FX path", () => {
    expect(convertToUSD(100, "XYZ", {})).toBeNull();
  });
  it("rejects bad caps", () => {
    expect(convertToUSD(0, "USD", {})).toBeNull();
    expect(convertToUSD(NaN, "USD", {})).toBeNull();
  });
});

describe("isSuspiciousMove", () => {
  it("flags moves over 60%", () => {
    expect(isSuspiciousMove(100, 170)).toBe(true);
    expect(isSuspiciousMove(100, 30)).toBe(true);
    expect(isSuspiciousMove(100, 140)).toBe(false);
    expect(isSuspiciousMove(100, 100)).toBe(false);
  });
});
