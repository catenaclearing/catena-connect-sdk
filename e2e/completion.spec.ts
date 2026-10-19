import { expect, type Page, test } from "@playwright/test";

/**
 * How a launch ends, in a real browser, through the package's listener.
 *
 * The connect app's end-to-end suite already checks what the app posts and in
 * what order. These tests cover what the package does with those messages: the
 * callbacks the host page gets, the watchdog that notices a closed window, and
 * `destroy()` partway through.
 *
 * The flow ends when its embed key carries `end=success` or `end=exit`
 * (`e2e/servers.mjs`).
 */

function key(scenario: string): string {
  return `${scenario};run=${crypto.randomUUID()}`;
}

async function hostPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => (window as { ready?: boolean }).ready);
}

async function open(page: Page, embedKey: string): Promise<void> {
  await page.evaluate((k) => {
    (window as unknown as { sdk: { open(k: string): void } }).sdk.open(k);
  }, embedKey);
}

async function destroy(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { sdk: { destroy(): void } }).sdk.destroy();
  });
}

async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as { events?: string[] }).events ?? []);
}

/** Launch with the probe cookie refused, then click Continue. */
async function openWindow(page: Page, scenario: string): Promise<Page> {
  await open(page, key(`cookie=refused;${scenario}`));
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);
  return popup;
}

/**
 * WebKit on Linux does not carry a partitioned cookie in a cross-site frame,
 * so every launch there goes to the window. Frame tests skip it, as in
 * `probe.spec.ts`.
 */
async function framesTheFlow(
  page: Page,
  browserName: string
): Promise<boolean> {
  if (browserName !== "webkit") return true;
  const platform = await page.evaluate(() => navigator.platform);
  return !platform.startsWith("Linux");
}

test.describe("in a frame", () => {
  test.beforeEach(async ({ page, browserName }) => {
    await hostPage(page);
    test.skip(
      !(await framesTheFlow(page, browserName)),
      "This browser does not carry a partitioned cookie in a cross-site frame"
    );
  });

  test("hears success, then close", async ({ page }) => {
    await open(page, key("end=success"));

    await expect
      .poll(() => events(page))
      .toEqual(["open", "success:conn_1,conn_2", "close"]);
  });

  test("hears exit, then close", async ({ page }) => {
    await open(page, key("end=exit"));

    await expect
      .poll(() => events(page))
      .toEqual(["open", "exit:user_exit", "close"]);
  });

  test("destroy() removes the frame and hears nothing after", async ({
    page,
  }) => {
    // The flow ends 2s after `open`, so `destroy()` runs first.
    await open(page, key("end=success;endAfter=2000"));
    await expect.poll(() => events(page)).toEqual(["open"]);

    await destroy(page);

    await expect(page.locator("iframe.frame")).toHaveCount(0);
    await page.waitForTimeout(2500);
    expect(await events(page)).toEqual(["open"]);
  });
});

test.describe("in a window", () => {
  test.beforeEach(async ({ page }) => {
    await hostPage(page);
  });

  test("hears success, then close", async ({ page }) => {
    await openWindow(page, "end=success");

    await expect
      .poll(() => events(page))
      .toEqual(["open", "success:conn_1,conn_2", "close"]);
  });

  test("hears close soon after the user closes the window", async ({
    page,
  }) => {
    const popup = await openWindow(page, "");
    await expect.poll(() => events(page)).toEqual(["open"]);

    // The SDK treats a window that closes within 1.5s of opening as cut off
    // by an opener policy (`SEVERED_MS`), not closed by the user.
    await page.waitForTimeout(1600);
    await popup.close();
    const closed = Date.now();

    // Poll every 100ms. The default backoff can leave a second between
    // checks, which would count against the bound below.
    await expect
      .poll(() => events(page), { intervals: [100] })
      .toEqual(["open", "close"]);
    // The watchdog checks every 500ms. The rest is slack for a slow runner.
    expect(Date.now() - closed).toBeLessThan(1500);
  });

  test("destroy() closes the window and hears nothing after", async ({
    page,
  }) => {
    const popup = await openWindow(page, "end=success;endAfter=2000");
    await expect.poll(() => events(page)).toEqual(["open"]);

    await Promise.all([popup.waitForEvent("close"), destroy(page)]);

    await page.waitForTimeout(2500);
    expect(await events(page)).toEqual(["open"]);
  });
});

test("throws on an empty embed key and mounts nothing", async ({ page }) => {
  await hostPage(page);

  const thrown = await page.evaluate(() => {
    try {
      (window as unknown as { sdk: { open(k: string): void } }).sdk.open("");
      return null;
    } catch (error) {
      return (error as Error).name;
    }
  });

  expect(thrown).toBe("TypeError");
  // The host page's own frame is the only one: no probe, no flow.
  expect(await page.locator("iframe").count()).toBe(1);
});
