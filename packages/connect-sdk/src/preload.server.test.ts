// @vitest-environment node

import { expect, it } from "vitest";

import { preload } from "./index";

it("does nothing where there is no document", () => {
  expect(typeof document).toBe("undefined");
  expect(() =>
    preload({ inviteUrl: "https://connect.example.com/invite/abc" })
  ).not.toThrow();
});
