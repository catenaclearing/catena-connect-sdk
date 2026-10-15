import { expect, type Page, test } from "@playwright/test";

/**
 * The launching page's own Cross-Origin-Opener-Policy, against popup mode.
 *
 * `same-origin` cuts the page off from any window it opens to another site:
 * the handle reports itself closed within a moment of the navigation, and
 * the flow's messages have nowhere to go. The package cannot see the header,
 * so it warns from the timing. `same-origin-allow-popups` keeps the channel.
 *
 * Every launch here is pushed onto popup mode by a probe whose cookie is
 * refused.
 */

async function launchWindow(page: Page, coop: string): Promise<string[]> {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(`/?coop=${coop}`);
  await page.waitForFunction(() => (window as { ready?: boolean }).ready);
  await page.evaluate((k) => {
    (window as unknown as { sdk: { open(k: string): void } }).sdk.open(k);
  }, `cookie=refused;run=${crypto.randomUUID()}`);
  await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);
  return warnings;
}

async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as { events?: string[] }).events ?? []);
}

test("same-origin severs the window, and the console says why", async ({
  page,
}) => {
  const warnings = await launchWindow(page, "same-origin");

  await expect.poll(() => events(page)).toEqual(["close"]);
  await expect
    .poll(() => warnings.join("\n"))
    .toContain("same-origin-allow-popups");
});

test("same-origin-allow-popups keeps the window talking", async ({ page }) => {
  const warnings = await launchWindow(page, "same-origin-allow-popups");

  await expect.poll(() => events(page)).toContain("open");
  expect(await events(page)).not.toContain("close");
  expect(warnings).toEqual([]);
});
