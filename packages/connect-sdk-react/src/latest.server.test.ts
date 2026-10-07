// @vitest-environment node

import { useEffect } from "react";
import { expect, it } from "vitest";

import { useIsomorphicLayoutEffect } from "./latest";

it("falls back to a plain effect where there is no window", () => {
  expect(typeof window).toBe("undefined");
  expect(useIsomorphicLayoutEffect).toBe(useEffect);
});
