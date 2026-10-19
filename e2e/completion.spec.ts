import { expect, type Page, test } from "@playwright/test";

/**
 * How a launch ends, through the package's own listener, in a real browser.
 *
 * The connect app's own end-to-end suite already checks what the app posts and
 * in what order, using raw listeners. These cover what only the package does
 * with those messages: the callbacks a host page gets, the watchdog that
 * notices a closed window, and `destroy()` partway through.
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

/** Launch on a probe whose cookie is refused, then take the window. */
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
 * so the probe sends every launch to the window there. Frame tests skip it, as
 * in `probe.spec.ts`.
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
    // The flow would end two seconds in. Destroyed first, it never gets to.
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

    // A window closed sooner than this after opening is taken for one an
    // opener policy cut off (`SEVERED_MS`), not one a person closed.
    await page.waitForTimeout(1600);
    await popup.close();
    const closed = Date.now();

    // A short fixed interval, so the time measured is when `close` arrived
    // and not when the poll's backoff next looked.
    await expect
      .poll(() => events(page), { intervals: [100] })
      .toEqual(["open", "close"]);
    // The watchdog checks every 500ms. The rest is slack for a busy runner.
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
