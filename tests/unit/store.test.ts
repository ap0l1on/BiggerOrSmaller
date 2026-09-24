import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBest, loadDaily, loadSettings, saveBest } from "../../src/store";

function memStorage(initial: Record<string, string> = {}) {
  let store: Record<string, string> = { ...initial };
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

describe("store", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memStorage());
  });

  it("loads 0 best by default and round-trips", () => {
    expect(loadBest()).toBe(0);
    saveBest(17);
    expect(loadBest()).toBe(17);
  });

  it("resets hostile best values cleanly", () => {
    (localStorage as Storage).setItem("outweigh:best", "not-json{{{");
    expect(loadBest()).toBe(0);
    (localStorage as Storage).setItem("outweigh:best", JSON.stringify(-5));
    expect(loadBest()).toBe(0);
    (localStorage as Storage).setItem("outweigh:best", JSON.stringify(1e12));
    expect(loadBest()).toBe(0);
  });

  it("schema-checks settings and daily", () => {
    expect(loadSettings()).toEqual({ reducedMotion: false, crypto: false });
    (localStorage as Storage).setItem("outweigh:settings", "{bad");
    expect(loadSettings()).toEqual({ reducedMotion: false, crypto: false });
    expect(loadDaily("2026-10-20")).toBeNull();
  });
});
