import { expect, test } from "@playwright/test";

/**
 * A launch into a container that lives in another document: the partner page
 * calls `open()` from its top window with an element inside a same-origin
 * frame of its own. jsdom moves elements between documents without the
 * consequences a browser has, so this is where those are pinned.
 *
 * The browser drops a constructed stylesheet from a shadow root adopted into
 * a document other than the one that made it, and the flow, framed inside
 * that document, posts its messages to that document's window.
 */

test("fills the container and hears the flow", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as { ready?: boolean }).ready);
  const platform = await page.evaluate(() => navigator.platform);
  test.skip(
    browserName === "webkit" && platform.startsWith("Linux"),
    "This browser does not carry a partitioned cookie in a cross-site frame"
  );

  await page.evaluate((k) => {
    (
      window as unknown as { sdk: { openInFrame(k: string): void } }
    ).sdk.openInFrame(k);
  }, `fast;run=${crypto.randomUUID()}`);

  const frame = page.frameLocator("#caller-frame").locator("iframe.frame");
  await expect(frame).toBeVisible({ timeout: 20_000 });

  // Close rather than equal: Firefox lays out in fractions of a pixel and
  // reports 480.00003. An unstyled frame is 300 by 150, nowhere near.
  const box = await frame.boundingBox();
  expect(box?.width).toBeCloseTo(576, 0);
  expect(box?.height).toBeCloseTo(480, 0);
  expect(await frame.evaluate((f) => getComputedStyle(f).borderTopWidth)).toBe(
    "0px"
  );

  await expect
    .poll(() => page.evaluate(() => (window as { events?: string[] }).events))
    .toContain("open");
});
