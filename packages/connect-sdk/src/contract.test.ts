/**
 * The contract as the connect app reads it, written out by hand.
 *
 * The app's integration test runs its output through this package, but it
 * installs this package from npm, so it only sees a change here after the
 * change is published. These tests are the check before that: every name and
 * shape the app depends on is spelled as a literal, not imported, so a rename
 * here fails this file and has to be made on purpose, alongside the app.
 *
 * The completion message is pinned the same way in `messages.test.ts`, and
 * the mode values in `url.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_COLOR_PARAM,
  BRAND_LOGO_DARK_PARAM,
  BRAND_LOGO_PARAM,
  BRAND_SECONDARY_PARAM,
  buildLaunchUrl,
  CONTRACT_VERSION,
  EMBED_FRAME,
  EMBED_KEY_PARAM,
  EMBED_PARAM,
  EMBED_POPUP,
  EMBED_REDIRECT,
  EVENT_CLOSE,
  EVENT_CONNECTION,
  EVENT_CONNECTION_DELETED,
  EVENT_EXIT,
  EVENT_OPEN,
  EVENT_PROBE,
  EVENT_SUCCESS,
  MESSAGE_SOURCE,
  PROBE_PATH,
  type ProbeMessage,
  SDK_VERSION_PARAM,
  THEME_PARAM,
  VARIANT_PARAM,
  withEmbedMode,
} from "./contract";
import { detectPartitionedCookies, LOAD_BUDGET_MS } from "./probe";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("the launch URL", () => {
  it("carries exactly the parameters the app reads, and no others", () => {
    // `Required` makes this object name every option that reaches the URL,
    // so an option added to `buildLaunchUrl` fails the type-check until it is
    // passed here, and then this list fails until its parameter is added.
    const options: Required<Parameters<typeof buildLaunchUrl>[0]> = {
      inviteUrl: "https://connect.example.com/invite/abc123",
      embedKey: "pk_test_key",
      variant: "card",
      theme: "dark",
      logoUrl: "https://host.example.com/logo.svg",
      logoUrlDark: "https://host.example.com/logo-dark.svg",
      brandColor: "#ff6600",
      brandSecondary: "#5bc2e7",
    };
    const url = new URL(withEmbedMode(buildLaunchUrl(options), "iframe"));

    expect([...url.searchParams.keys()].sort()).toEqual([
      "brand_color",
      "brand_logo",
      "brand_logo_dark",
      "brand_secondary",
      "embed",
      "embed_key",
      "sdk_version",
      "theme",
      "variant",
    ]);
  });

  it("exports each parameter name under the spelling the app reads", () => {
    expect(EMBED_PARAM).toBe("embed");
    expect(EMBED_KEY_PARAM).toBe("embed_key");
    expect(SDK_VERSION_PARAM).toBe("sdk_version");
    expect(VARIANT_PARAM).toBe("variant");
    expect(THEME_PARAM).toBe("theme");
    expect(BRAND_LOGO_PARAM).toBe("brand_logo");
    expect(BRAND_LOGO_DARK_PARAM).toBe("brand_logo_dark");
    expect(BRAND_COLOR_PARAM).toBe("brand_color");
    expect(BRAND_SECONDARY_PARAM).toBe("brand_secondary");
  });

  it("exports each mode under the spelling the app reads", () => {
    expect(EMBED_FRAME).toBe("iframe");
    expect(EMBED_POPUP).toBe("popup");
    expect(EMBED_REDIRECT).toBe("redirect");
  });
});

describe("the messages", () => {
  it("exports the envelope and every event under the app's spelling", () => {
    expect(MESSAGE_SOURCE).toBe("catena-connect");
    expect(CONTRACT_VERSION).toBe(1);
    expect(EVENT_OPEN).toBe("open");
    expect(EVENT_CONNECTION).toBe("connection");
    expect(EVENT_CONNECTION_DELETED).toBe("connection_deleted");
    expect(EVENT_SUCCESS).toBe("success");
    expect(EVENT_EXIT).toBe("exit");
    expect(EVENT_CLOSE).toBe("close");
    expect(EVENT_PROBE).toBe("probe");
  });
});

describe("the probe", () => {
  it("loads the page at the path the app serves it from", async () => {
    vi.useFakeTimers();
    expect(PROBE_PATH).toBe("/embed/probe");

    const pending = detectPartitionedCookies(
      "https://connect-path.example.com"
    );

    const frame = document.body.querySelector("iframe");
    expect(new URL(frame?.src ?? "").pathname).toBe("/embed/probe");

    // Nothing answers, so let it run out rather than leave it running.
    await vi.advanceTimersByTimeAsync(LOAD_BUDGET_MS);
    await expect(pending).resolves.toBe("unsupported");
  });

  it("reads the verdict in the shape the probe page posts it", async () => {
    // Field for field what the app's probe page posts, numeric version
    // included. The verdict is the one message that nests. Were it read from
    // beside `event`, every probe would come back unsupported and every
    // browser would quietly fall back to the window, with nothing failing.
    const origin = "https://connect-shape.example.com";
    const pending = detectPartitionedCookies(origin);
    const frame = document.body.querySelector("iframe");

    const event = new MessageEvent("message", {
      origin,
      data: {
        source: "catena-connect",
        version: 1,
        event: "probe",
        payload: { supported: true },
      } satisfies ProbeMessage,
    });
    Object.defineProperty(event, "source", { value: frame?.contentWindow });
    window.dispatchEvent(event);

    await expect(pending).resolves.toBe("supported");
  });
});
