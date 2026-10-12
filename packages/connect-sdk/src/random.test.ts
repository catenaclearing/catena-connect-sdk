import { describe, expect, it } from "vitest";
import { randomTail } from "./random";

describe("randomTail", () => {
  it("is twelve hex characters", () => {
    expect(randomTail()).toMatch(/^[0-9a-f]{12}$/);
  });

  it("differs from one call to the next", () => {
    const tails = new Set(Array.from({ length: 100 }, randomTail));
    expect(tails.size).toBe(100);
  });
});
