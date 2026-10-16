import { expect, test } from "@playwright/test";

/**
 * The browser build, loaded by a classic `<script>` tag the way a page with
 * no bundler loads it from a CDN. The unit tests import the source, so this
 * is the only place the global it defines is checked.
 */

test("defines the global with the three exports", async ({ page }) => {
  await page.goto("/script");
  await page.waitForFunction(() => (window as { ready?: boolean }).ready);

  const exported = await page.evaluate(() =>
    Object.entries(
      (window as unknown as { CatenaConnect: Record<string, unknown> })
        .CatenaConnect
    )
      .map(([name, value]) => `${name}:${typeof value}`)
      .sort()
  );
  expect(exported).toEqual([
    "open:function",
    "preload:function",
    "resume:function",
  ]);
});

test("launches through the global", async ({ page }) => {
  await page.goto("/script");
  await page.waitForFunction(() => (window as { ready?: boolean }).ready);

  await page.evaluate((k) => {
    (window as unknown as { sdk: { open(k: string): void } }).sdk.open(k);
  }, `fast;run=${crypto.randomUUID()}`);

  // Either mode will do: which one this browser lands in is the probe's
  // business, and its own tests pin that. What matters here is that a launch
  // made through the global gets as far as a surface.
  const frame = page.locator("iframe.frame");
  const button = page.getByRole("button", { name: "Continue" });
  await expect(frame.or(button)).toBeVisible({ timeout: 20_000 });
});
