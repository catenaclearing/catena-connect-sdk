import { describe, expect, it } from "vitest";

import { buildLaunchUrl, connectOrigin, withEmbedMode } from "./url";

const inviteUrl = "https://connect.example.com/invite/abc123";
const embedKey = "pk_test_key";

/** The launch URL's parameters, as the app would read them. */
function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("buildLaunchUrl", () => {
  it("carries the embed key, and leaves the mode to the launch", () => {
    // The mode is not knowable here: the probe has not answered when this is
    // built. `withEmbedMode` names it on the way into the rung that won.
    const params = paramsOf(buildLaunchUrl({ inviteUrl, embedKey }));

    expect(params.get("embed_key")).toBe(embedKey);
    expect(params.get("embed")).toBeNull();
  });

  it("keeps the invite URL's own path and host", () => {
    const url = new URL(buildLaunchUrl({ inviteUrl, embedKey }));

    expect(url.origin).toBe("https://connect.example.com");
    expect(url.pathname).toBe("/invite/abc123");
  });

  it("forwards every presentation and branding option given", () => {
    const params = paramsOf(
      buildLaunchUrl({
        inviteUrl,
        embedKey,
        variant: "card",
        theme: "dark",
        logoUrl: "https://host.example.com/logo.svg",
        logoUrlDark: "https://host.example.com/logo-dark.svg",
        brandColor: "#ff6600",
      })
    );

    expect(params.get("variant")).toBe("card");
    expect(params.get("theme")).toBe("dark");
    expect(params.get("brand_logo")).toBe("https://host.example.com/logo.svg");
    expect(params.get("brand_logo_dark")).toBe(
      "https://host.example.com/logo-dark.svg"
    );
    expect(params.get("brand_color")).toBe("#ff6600");
  });

  it("forwards branding values a validator would have rejected, unchanged", () => {
    // No package-side hex check and no URL check, deliberately.
    // The app ignores a value it cannot use and falls back; a check here could
    // only turn that fallback into an error, and it would do it using rules
    // guaranteed to lag the app's. A relative logo path and a CSS color
    // keyword are both legitimate today and both fail the obvious validator.
    const params = paramsOf(
      buildLaunchUrl({
        inviteUrl,
        embedKey,
        logoUrl: "/assets/logo.svg",
        logoUrlDark: "logo-dark.svg",
        brandColor: "rebeccapurple",
      })
    );

    expect(params.get("brand_logo")).toBe("/assets/logo.svg");
    expect(params.get("brand_logo_dark")).toBe("logo-dark.svg");
    expect(params.get("brand_color")).toBe("rebeccapurple");
  });

  it("forwards a brand color that is not a hex triple at all", () => {
    const params = paramsOf(
      buildLaunchUrl({ inviteUrl, embedKey, brandColor: "oklch(0.7 0.2 30)" })
    );

    expect(params.get("brand_color")).toBe("oklch(0.7 0.2 30)");
  });

  it("omits an option the caller did not supply rather than sending it empty", () => {
    const params = paramsOf(buildLaunchUrl({ inviteUrl, embedKey }));

    expect(params.has("variant")).toBe(false);
    expect(params.has("theme")).toBe(false);
    expect(params.has("brand_logo")).toBe(false);
    expect(params.has("brand_logo_dark")).toBe(false);
    expect(params.has("brand_color")).toBe(false);
  });

  it("forwards a presentation value this version has never heard of, unchanged", () => {
    // The whole point of forwarding rather than validating: a caller on an
    // installed version can use a value the app started accepting after it.
    const params = paramsOf(
      buildLaunchUrl({
        inviteUrl,
        embedKey,
        variant: "compact-sidebar",
        theme: "high-contrast",
      })
    );

    expect(params.get("variant")).toBe("compact-sidebar");
    expect(params.get("theme")).toBe("high-contrast");
  });

  it("preserves query parameters the invite URL already carried", () => {
    const params = paramsOf(
      buildLaunchUrl({
        inviteUrl: "https://connect.example.com/invite/abc123?ref=email&t=9",
        embedKey,
      })
    );

    expect(params.get("ref")).toBe("email");
    expect(params.get("t")).toBe("9");
    expect(params.get("embed_key")).toBe(embedKey);
  });

  it("overwrites rather than duplicates a parameter the invite URL already set", () => {
    const url = buildLaunchUrl({
      inviteUrl: "https://connect.example.com/invite/abc123?variant=full",
      embedKey,
      variant: "card",
    });

    expect(new URL(url).searchParams.getAll("variant")).toEqual(["card"]);
  });
});

describe("connectOrigin", () => {
  it("derives the origin from the caller's invite URL", () => {
    expect(connectOrigin(inviteUrl)).toBe("https://connect.example.com");
  });

  it("derives a development environment's origin with no special case", () => {
    // The package holds no origin of its own, which is what makes this work
    // and what keeps an internal hostname out of the published bundle.
    expect(connectOrigin("http://localhost:3000/invite/abc")).toBe(
      "http://localhost:3000"
    );
  });

  it("drops the path, query and port-implied default from the origin", () => {
    expect(connectOrigin("https://connect.example.com:8443/invite/x?y=1")).toBe(
      "https://connect.example.com:8443"
    );
  });

  it("throws on a URL it cannot parse, rather than inventing an origin", () => {
    expect(() => connectOrigin("not-a-url")).toThrow();
  });

  it.each([
    "about:blank",
    "data:text/html,<p>hi",
    "javascript:alert(1)",
    "file:///invite/abc",
  ])("throws on %s rather than trusting an opaque origin", (inviteUrl) => {
    // Each of these parses, and each serializes its origin to the *string*
    // "null" — so without the scheme check the package would carry "null" as
    // the origin it trusts. `${origin}${PROBE_PATH}` would become a relative
    // URL resolving against the host page, and the origin guard on
    // inbound messages would stop telling opaque contexts apart, since every
    // one of them reports that same "null".
    expect(() => connectOrigin(inviteUrl)).toThrow();
  });

  it("refuses http anywhere but loopback", () => {
    // Everything the origin is used for assumes nobody else can be it: the
    // frame, the window, and the guard that decides an inbound message is
    // the flow rather than a page pretending to be it. On plain http over a
    // network someone else is on, all three are theirs.
    expect(() =>
      connectOrigin("http://connect.example.com/invite/abc")
    ).toThrow();
    expect(() =>
      connectOrigin("http://192.168.1.10:3000/invite/abc")
    ).toThrow();
  });

  it("keeps http on the addresses that have no network to be on", () => {
    // The one case a caller needs while building against a local app.
    expect(connectOrigin("http://localhost:3000/invite/abc")).toBe(
      "http://localhost:3000"
    );
    expect(connectOrigin("http://127.0.0.1:3000/invite/abc")).toBe(
      "http://127.0.0.1:3000"
    );
    expect(connectOrigin("http://[::1]:3000/invite/abc")).toBe(
      "http://[::1]:3000"
    );
  });

  it("throws on a blob URL, whose origin looks admissible", () => {
    // The one that would slip a denylist: its origin serializes to a real
    // one. The URL still cannot carry the launch parameters.
    expect(() =>
      connectOrigin("blob:https://connect.example.com/abc")
    ).toThrow();
  });
});

describe("withEmbedMode", () => {
  const launchUrl = buildLaunchUrl({ inviteUrl, embedKey });

  // Spelled out one rung at a time rather than as a table, because the values
  // are the app's contract and a table would let a wrong one read as right.
  it("names a framed run", () => {
    expect(paramsOf(withEmbedMode(launchUrl, "iframe")).get("embed")).toBe(
      "iframe"
    );
  });

  it("names a windowed run", () => {
    expect(paramsOf(withEmbedMode(launchUrl, "popup")).get("embed")).toBe(
      "popup"
    );
  });

  it("names a redirected run", () => {
    // Not standalone. The caller's product opened this one too; it just ends
    // up top-level, and the app tells the two apart by this parameter.
    expect(paramsOf(withEmbedMode(launchUrl, "redirect")).get("embed")).toBe(
      "redirect"
    );
  });

  it("leaves every other parameter alone", () => {
    const params = paramsOf(withEmbedMode(launchUrl, "iframe"));

    expect(params.get("embed_key")).toBe(embedKey);
    expect(new URL(withEmbedMode(launchUrl, "iframe")).pathname).toBe(
      "/invite/abc123"
    );
  });

  it("overwrites rather than duplicates a mode already named", () => {
    const params = paramsOf(
      withEmbedMode(withEmbedMode(launchUrl, "iframe"), "popup")
    );

    expect(params.getAll("embed")).toEqual(["popup"]);
  });
});
