/**
 * The type contract behind the presentation options.
 *
 * These assertions are checked by `pnpm tsc` rather than by the test runner —
 * the annotations are the test, and the runtime expectations exist so the
 * claim also appears in the test output. What each one forwards to the app is
 * covered in `url.test.ts`; this file only guards the shape of the types.
 */

import { describe, expect, it } from "vitest";

import type {
  CatenaConnectOptions,
  ConnectTheme,
  ConnectVariant,
} from "./types";

/**
 * The literal arms of a widened union, with the `string` arm dropped.
 *
 * `string extends T` holds only for the arm that is `string` itself, so
 * distributing over the union keeps the recorded values and discards the
 * widening.
 */
type KnownValues<T> = T extends string ? (string extends T ? never : T) : never;

/**
 * `true` only when `T` and `U` are the same set of values.
 *
 * The tuple wrappers stop the conditional distributing over the union, which
 * is what makes this compare the sets rather than each member in turn.
 */
type SameValues<T, U> = [T] extends [U]
  ? [U] extends [T]
    ? true
    : false
  : false;

describe("presentation option types", () => {
  it("accepts a value this version has never heard of", () => {
    // Removing the `(string & {})` widening fails the type-check here. That
    // is the whole point: the failure lands on the contributor narrowing the
    // type, not months later on a caller whose build breaks because the app
    // started accepting a value their installed package predates.
    const options: CatenaConnectOptions = {
      inviteUrl: "https://connect.example.com/invite/abc123",
      embedKey: "pk_test_key",
      variant: "compact-sidebar",
      theme: "high-contrast",
    };

    expect(options.variant).toBe("compact-sidebar");
    expect(options.theme).toBe("high-contrast");
  });

  it("records exactly the known values, so they all autocomplete", () => {
    // The assertion above passes just as happily against a plain `string`,
    // which would quietly give up the reason a caller prefers typed options
    // to a raw snippet. This one does not.
    //
    // The lists are spelled out rather than sampled because the widening makes
    // every way of getting them wrong silent. Dropping a value still compiles
    // for everyone — it is accepted by the `string` arm — so nothing fails
    // except the autocomplete, in an editor, for someone who never finds out
    // the value was ever offered. Adding one to the union is a deliberate
    // public-API change and is meant to land here in the same commit.
    const variantsRecorded: SameValues<
      KnownValues<ConnectVariant>,
      "full" | "card"
    > = true;
    const themesRecorded: SameValues<
      KnownValues<ConnectTheme>,
      "light" | "dark"
    > = true;

    // Each annotation above is the assertion: a mismatched set resolves to
    // `false`, and `true` is then not assignable to it.
    expect(variantsRecorded).toBe(true);
    expect(themesRecorded).toBe(true);
  });
});
