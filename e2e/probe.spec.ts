import { expect, type Page, test } from "@playwright/test";

/**
 * The iframe check, timed against a connect origin that can be made slow at
 * each step. Each scenario is the embed key the stand-in server reads
 * (`e2e/servers.mjs`); the SDK forwards it untouched.
 *
 * The timings are loose on purpose. What they pin is which side of each
 * budget an outcome lands on, not how fast this machine is.
 */

type Outcome = { mode: "frame" | "continue"; ms: number };

/**
 * A scenario no other test shares. The server counts probe requests per key
 * for `docOnce`, and the three browsers run against the same server at once.
 */
function key(scenario: string): string {
  return `${scenario};run=${crypto.randomUUID()}`;
}

async function partnerPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => (window as { ready?: boolean }).ready);
}

/** Launch, and report which mode it settled on and how long that took. */
async function launch(page: Page, embedKey: string): Promise<Outcome> {
  const started = Date.now();
  await page.evaluate((k) => {
    (window as unknown as { sdk: { open(k: string): void } }).sdk.open(k);
  }, embedKey);
  return settled(page, started);
}

async function settled(page: Page, started: number): Promise<Outcome> {
  const frame = page.locator("iframe.frame");
  const button = page.getByRole("button", { name: "Continue" });
  await expect(frame.or(button)).toBeVisible({ timeout: 20_000 });
  const mode = (await frame.count()) > 0 ? "frame" : "continue";
  return { mode, ms: Date.now() - started };
}

/**
 * Tests that need the browser to carry a partitioned cookie in a cross-site
 * frame, because they expect the flow to end up there.
 *
 * WebKit on Linux does not carry it, so on that platform the SDK correctly
 * offers the window and these cannot test the frame. They are skipped there,
 * and "a browser that refuses the cookie" below pins that fallback instead.
 * WebKit on macOS carries the cookie and runs them.
 */
const FRAMED = { tag: "@frame" };

async function refusesPartitionedCookies(
  page: Page,
  browserName: string
): Promise<boolean> {
  if (browserName !== "webkit") return false;
  const platform = await page.evaluate(() => navigator.platform);
  return platform.startsWith("Linux");
}

test.beforeEach(async ({ page, browserName }, testInfo) => {
  if (!testInfo.tags.includes("@frame")) return;
  test.skip(
    await refusesPartitionedCookies(page, browserName),
    "This browser does not carry a partitioned cookie in a cross-site frame"
  );
});

async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as { events?: string[] }).events ?? []);
}

test.describe("a fast network", () => {
  test("frames the flow straight away", FRAMED, async ({ page }) => {
    await partnerPage(page);
    const outcome = await launch(page, key("fast"));

    expect(outcome.mode).toBe("frame");
    expect(outcome.ms).toBeLessThan(2000);
    await expect.poll(() => events(page)).toContain("open");
  });

  test("offers the window promptly when the cookie is refused", async ({
    page,
  }) => {
    await partnerPage(page);
    const outcome = await launch(page, key("cookie=refused"));

    expect(outcome.mode).toBe("continue");
    expect(outcome.ms).toBeLessThan(2000);
  });

  test("opens the window under a name of its own", async ({ page }) => {
    // A fixed name made `window.open` look for an existing window first,
    // which Chrome refuses to navigate when this page did not open it.
    await partnerPage(page);
    await launch(page, key("cookie=refused"));

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);

    expect(await popup.evaluate(() => window.name)).toMatch(/^catena-connect-/);
    await expect.poll(() => events(page)).toContain("open");
  });
});

test.describe("a slow network", () => {
  test(
    "waits for a probe page that takes four seconds to arrive",
    FRAMED,
    async ({ page }) => {
      // A cold connection through a TLS-inspecting proxy. Before the load
      // budget, anything over 2.5 seconds here was sent to the window.
      await partnerPage(page);
      const outcome = await launch(page, key("doc=4000"));

      expect(outcome.mode).toBe("frame");
      expect(outcome.ms).toBeGreaterThanOrEqual(3800);
    }
  );

  test(
    "frames on the first launch when only the first contact is slow",
    FRAMED,
    async ({ page }) => {
      await partnerPage(page);
      const outcome = await launch(page, key("docOnce=3000"));

      expect(outcome.mode).toBe("frame");
    }
  );

  test("waits for a slow cookie round trip", FRAMED, async ({ page }) => {
    await partnerPage(page);
    const outcome = await launch(page, key("set=500;check=500"));

    expect(outcome.mode).toBe("frame");
  });

  test(
    "moves the wait off the click when the page preloads",
    FRAMED,
    async ({ page }) => {
      await partnerPage(page);
      const embedKey = key("doc=3000");
      await page.evaluate((k) => {
        (
          window as unknown as { sdk: { preload(k: string): void } }
        ).sdk.preload(k);
      }, embedKey);
      await page.waitForTimeout(3500);

      const outcome = await launch(page, embedKey);

      expect(outcome.mode).toBe("frame");
      expect(outcome.ms).toBeLessThan(1000);
    }
  );
});

test.describe("a network that is slow on every request", () => {
  test(
    "frames the flow when each request takes two seconds",
    FRAMED,
    async ({ page }) => {
      // Chrome's Slow 3G profile adds about two seconds to every request,
      // as a heavy TLS-inspecting proxy can. The page, `set` and `check`
      // each pay it, so the round trip after `load` alone takes four.
      await partnerPage(page);
      const outcome = await launch(page, key("doc=2000;set=2000;check=2000"));

      expect(outcome.mode).toBe("frame");
    }
  );

  test(
    "checks again after the page's own limit runs out",
    FRAMED,
    async ({ page }) => {
      // A `set` that outlasts the page's own budget is slowness, not a
      // refused cookie. The page stays silent rather than posting `false`,
      // so the SDK times out, remembers nothing, and the next launch frames.
      await partnerPage(page);
      const embedKey = key("setOnce=hang");

      expect((await launch(page, embedKey)).mode).toBe("continue");

      await page.evaluate(() => {
        (window as unknown as { sdk: { destroy(): void } }).sdk.destroy();
      });
      const second = await launch(page, embedKey);

      expect(second.mode).toBe("frame");
    }
  );
});

test.describe("a probe that never answers", () => {
  test("gives up on a loaded page about six seconds after it loads", async ({
    page,
  }) => {
    // What an origin the embed key does not cover looks like: the frame
    // loads and nothing reports.
    await partnerPage(page);
    const outcome = await launch(page, key("silent"));

    expect(outcome.mode).toBe("continue");
    expect(outcome.ms).toBeGreaterThanOrEqual(5800);
    expect(outcome.ms).toBeLessThan(10000);
  });

  test("gives up on a page that never arrives after about eight seconds", async ({
    page,
  }) => {
    await partnerPage(page);
    const outcome = await launch(page, key("doc=hang"));

    expect(outcome.mode).toBe("continue");
    expect(outcome.ms).toBeGreaterThanOrEqual(7800);
  });

  test(
    "checks again on the next launch instead of remembering the timeout",
    FRAMED,
    async ({ page }) => {
      await partnerPage(page);
      const embedKey = key("docOnce=hang");

      expect((await launch(page, embedKey)).mode).toBe("continue");

      await page.evaluate(() => {
        (window as unknown as { sdk: { destroy(): void } }).sdk.destroy();
      });
      const second = await launch(page, embedKey);

      expect(second.mode).toBe("frame");
    }
  );
});

test.describe("a browser that refuses the cookie", () => {
  test("offers the window on a fast network", async ({ page, browserName }) => {
    // The other half of the skip above: where the browser will not carry the
    // cookie, a fast network still ends at the window, and promptly.
    await partnerPage(page);
    test.skip(
      !(await refusesPartitionedCookies(page, browserName)),
      "This browser carries the cookie; the frame tests cover it"
    );

    const outcome = await launch(page, key("fast"));

    expect(outcome.mode).toBe("continue");
    expect(outcome.ms).toBeLessThan(2000);
  });
});
