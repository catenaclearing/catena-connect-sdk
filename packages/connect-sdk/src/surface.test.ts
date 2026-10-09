import { afterEach, describe, expect, it } from "vitest";

import { createSurface } from "./surface";

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

/**
 * The surface's CSS, from whichever mechanism carried it. A constructable
 * stylesheet is preferred so a host page's `style-src` does not have to allow
 * inline styles; the `<style>` element is the fallback.
 */
function cssOf(shadow: ShadowRoot | null | undefined): string {
  const adopted = shadow?.adoptedStyleSheets ?? [];
  if (adopted.length > 0) {
    return adopted
      .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
      .join("\n");
  }
  return shadow?.querySelector("style")?.textContent ?? "";
}

/** The element the package appended, whether overlaid or mounted inline. */
function hostIn(parent: ParentNode): Element | null {
  return (
    [...parent.children].find((child) => child.shadowRoot !== null) ?? null
  );
}

describe("style isolation", () => {
  it("renders into a shadow root", () => {
    createSurface();

    const host = hostIn(document.body);
    expect(host?.shadowRoot).not.toBeNull();
  });

  it("keeps every style rule inside that root", () => {
    const surface = createSurface();
    surface.showLoading();

    expect(cssOf(hostIn(document.body)?.shadowRoot)).not.toBe("");
  });

  it("carries its styles without needing inline styles to be allowed", () => {
    // A caller strict enough to omit `unsafe-inline` from `style-src` would
    // otherwise get an unstyled overlay — and would lose the host
    // protections below, which is where isolation matters most. A
    // constructable stylesheet is CSSOM, so the policy does not gate it.
    createSurface();

    const shadow = hostIn(document.body)?.shadowRoot;
    expect(shadow?.adoptedStyleSheets.length).toBeGreaterThan(0);
    expect(shadow?.querySelector("style")).toBeNull();
  });

  it("adds no rules to the host document", () => {
    // The direction a prefixed-class convention would also satisfy — but the
    // shadow root is what gives it without depending on anyone remembering.
    const headBefore = document.head.children.length;

    createSurface();

    expect(document.head.children.length).toBe(headBefore);
    // `querySelector` does not cross a shadow boundary, so a null result
    // here is exactly the claim: no style element in the light DOM. Not
    // asserted on `document.styleSheets` — jsdom counts a shadow root's
    // sheet in it, which no browser does, so that assertion would fail
    // while describing something true.
    expect(document.querySelector("style")).toBeNull();
  });
});

describe("giving an inline mount a height to fill", () => {
  it("stretches the inline panel rather than sizing it by percentage", () => {
    // The overlay takes its height from `position: fixed; inset: 0`. An
    // inline mount has no such source, and a percentage height against a
    // parent sized by its content resolves to `auto` — which collapses the
    // chain and leaves a frame at an iframe's intrinsic height, a short
    // strip inside the surface the caller reserved.
    //
    // This asserts the rule ships, not that it lays out: jsdom has no
    // layout engine, so the inline mount is on the real-browser list.
    const container = document.createElement("div");
    document.body.append(container);
    createSurface(container);

    const css = cssOf(hostIn(container)?.shadowRoot);
    expect(css).toMatch(/\.root:not\(\.overlay\) \.panel/);
    expect(css).toMatch(/align-self: stretch/);
  });

  it("sizes its own host from inside the shadow root, keyed on a marker", () => {
    // The rule above only pays off once something over it has a height, and
    // nothing else gives the host one: the chain falls to `min-height` and
    // the mount is 480px tall in the 800 the caller reserved. The sizing has
    // to be a `:host` rule, not an inline style — important declarations from
    // the inner tree beat the outer's, so this stylesheet's own `all: initial
    // !important` would override an important inline height on the host.
    //
    // Asserts the marker and the rule ship; whether the cascade honors them is
    // a real-browser check, since jsdom has no cascade or layout.
    const container = document.createElement("div");
    document.body.append(container);
    createSurface(container);

    const host = hostIn(container) as HTMLElement;
    const css = cssOf(host.shadowRoot);

    expect(host.hasAttribute("data-inline")).toBe(true);
    expect(css).toMatch(
      /:host\(\[data-inline\]\)\s*\{[^}]*height:\s*100%\s*!important/
    );
  });

  it("leaves the overlay's host unmarked, since the viewport sizes that one", () => {
    // A viewport-tall shadow host in the page's body would push the caller's
    // page down.
    createSurface();

    const host = hostIn(document.body) as HTMLElement;

    expect(host.hasAttribute("data-inline")).toBe(false);
  });
});

describe("protecting the host element", () => {
  it("marks the declarations the surface cannot survive losing as important", () => {
    // The shadow host lives in the caller's document, so their `div` and
    // `*` rules match it. For normal declarations the outer tree wins, which
    // means a plain `:host { display: block }` loses to `div { display: none }`
    // and the whole surface vanishes. Importance reverses the tree order.
    //
    // jsdom has no cascade, so this asserts the rule is written correctly
    // rather than that a browser resolves it correctly — the second half is
    // a real-browser check against a hostile host page.
    createSurface();

    const css = cssOf(hostIn(document.body)?.shadowRoot);
    const hostRule = css.slice(css.indexOf(":host"), css.indexOf("}"));

    expect(hostRule).toContain("display: block !important");
    expect(hostRule).toContain("visibility: visible !important");
  });
});

describe("the overlay as a modal", () => {
  it("announces itself as a modal dialog with a name", () => {
    createSurface();

    const root = hostIn(document.body)?.shadowRoot?.querySelector(
      "[role='dialog']"
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-modal")).toBe("true");
    expect(root?.getAttribute("aria-label")).not.toBe("");
  });

  it("takes the rest of the document out of the tab order", () => {
    // `aria-modal` announces that the rest of the page is not there, and
    // nothing made that true for a keyboard: Tab walked out of the overlay
    // and into controls the user could no longer see.
    const behind = document.createElement("button");
    document.body.append(behind);

    createSurface();

    expect(behind.inert).toBe(true);
  });

  it("gives the page back when it comes down", () => {
    const behind = document.createElement("button");
    document.body.append(behind);

    createSurface().destroy();

    expect(Boolean(behind.inert)).toBe(false);
  });

  it("leaves an element that was already inert alone", () => {
    // A caller who launched us from inside their own modal had already
    // taken this out of the tab order. Restoring it would hand back a page
    // they never had.
    const theirs = document.createElement("div");
    theirs.inert = true;
    document.body.append(theirs);

    createSurface().destroy();

    expect(theirs.inert).toBe(true);
  });

  it("takes nothing out of the tab order for an inline mount", () => {
    // Claiming no modality and enforcing one would be the same disagreement
    // the other way around.
    const behind = document.createElement("button");
    const container = document.createElement("div");
    document.body.append(behind, container);

    createSurface(container);

    expect(Boolean(behind.inert)).toBe(false);
  });

  it("takes a later arrival out of the tab order too", async () => {
    // The page behind a modal does not hold still: a toast, a route change,
    // a caller's own portal. Without this, their next render puts something
    // focusable outside the set we took out of the tab order.
    createSurface();

    const late = document.createElement("button");
    document.body.append(late);

    // The observer runs as a microtask, so the assertion has to come after
    // one rather than in the same turn as the append.
    await Promise.resolve();

    expect(late.inert).toBe(true);
  });

  it("stops watching once it comes down", async () => {
    createSurface().destroy();

    const after = document.createElement("button");
    document.body.append(after);
    await Promise.resolve();

    expect(Boolean(after.inert)).toBe(false);
  });

  it("gives back what arrived late, along with the rest", async () => {
    const behind = document.createElement("button");
    document.body.append(behind);

    const surface = createSurface();

    const late = document.createElement("button");
    document.body.append(late);
    await Promise.resolve();

    surface.destroy();

    expect(Boolean(behind.inert)).toBe(false);
    expect(Boolean(late.inert)).toBe(false);
  });

  it("watches nothing for an inline mount", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    createSurface(container);

    const late = document.createElement("button");
    document.body.append(late);
    await Promise.resolve();

    expect(Boolean(late.inert)).toBe(false);
  });

  it("stands down when the surface leaves the document without us", async () => {
    // `destroy()` is the supported way down. A caller who replaces the page
    // around us instead has nothing of ours up any more, and a watcher still
    // inerting whatever they render next would be ours to explain.
    createSurface();
    document.body.replaceChildren();

    const after = document.createElement("button");
    document.body.append(after);
    await Promise.resolve();

    expect(Boolean(after.inert)).toBe(false);
  });

  it("gives the page back when only the host is removed without destroy()", async () => {
    // Narrower than replacing the page: a caller's component unmount that
    // takes our host and nothing else. Standing the watcher down was not
    // enough — the siblings it had marked stayed inert with no overlay on
    // screen, and the keyboard reached nothing.
    const behind = document.createElement("button");
    document.body.append(behind);
    createSurface();
    expect(behind.inert).toBe(true);

    hostIn(document.body)?.remove();
    await Promise.resolve();

    expect(Boolean(behind.inert)).toBe(false);
  });

  it("takes focus, so the user is not left on the page behind it", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    createSurface();

    expect(document.activeElement).not.toBe(trigger);
  });

  it("returns focus to where it was when it comes down", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const surface = createSurface();

    surface.destroy();

    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to a control inside the caller's own component", () => {
    // `document.activeElement` stops at a shadow host, so a caller whose
    // launch button lives in a web component would otherwise get focus back
    // on the component rather than on the button.
    const host = document.createElement("div");
    document.body.append(host);
    const inner = host.attachShadow({ mode: "open" });
    const trigger = document.createElement("button");
    inner.append(trigger);
    trigger.focus();

    const surface = createSurface();
    surface.destroy();

    expect(inner.activeElement).toBe(trigger);
  });

  it("returns focus to an SVG control", () => {
    // An icon button drawn as SVG can hold focus and has `focus()`, but is
    // not an HTMLElement — a class check would silently skip it.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const trigger = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    trigger.setAttribute("tabindex", "0");
    svg.append(trigger);
    document.body.append(svg);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const surface = createSurface();
    surface.destroy();

    expect(document.activeElement).toBe(trigger);
  });

  it("does not throw when the element focus came from has since been removed", () => {
    // A host single-page app re-rendering behind the overlay.
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const surface = createSurface();
    trigger.remove();

    expect(() => surface.destroy()).not.toThrow();
  });

  it("returns focus to the overlay when an already-live surface is refocused", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const surface = createSurface();
    // The user tabbed back out to the page behind the overlay.
    trigger.focus();

    surface.focus();

    expect(document.activeElement).not.toBe(trigger);
  });

  it("takes no focus when a caller's container is refocused either", () => {
    // The first launch deliberately leaves their page's focus alone, so a
    // relaunch must too — otherwise clicking the launch button twice does
    // something the first click promised not to.
    const container = document.createElement("section");
    const trigger = document.createElement("button");
    document.body.append(container, trigger);
    const surface = createSurface(container);
    trigger.focus();

    surface.focus();

    expect(document.activeElement).toBe(trigger);
  });

  it("claims no modality and takes no focus inside a caller's container", () => {
    // Their container sits in a layout they built and may not be modal at
    // all. Announcing it as one would be the package overruling them.
    const container = document.createElement("section");
    const trigger = document.createElement("button");
    document.body.append(container, trigger);
    trigger.focus();

    createSurface(container);

    // The loading region still carries `role="status"` — an inline mount
    // announces its loading too. What it must not claim is modality.
    expect(
      hostIn(container)?.shadowRoot?.querySelector("[role='dialog']")
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("mounting", () => {
  it("renders its own overlay when the caller supplied no container", () => {
    createSurface();

    expect(hostIn(document.body)).not.toBeNull();
  });

  it("renders inside the caller's container when one was supplied", () => {
    const container = document.createElement("section");
    document.body.append(container);

    createSurface(container);

    expect(hostIn(container)).not.toBeNull();
    // Nothing of ours is appended to the document alongside it.
    expect(hostIn(document.body)).toBeNull();
  });

  it("builds no overlay around an inline mount", () => {
    // The overlay is what fixes the surface to the viewport and covers the
    // host page. Inside their container the surface is one element of
    // a layout they built, so the state that does that must be absent —
    // asserted as a state rather than as a rendered position, because jsdom
    // has no layout engine to ask.
    const container = document.createElement("section");
    document.body.append(container);

    createSurface(container);

    const root = hostIn(container)?.shadowRoot?.querySelector(".root");
    expect(root).not.toBeNull();
    expect(root?.classList.contains("overlay")).toBe(false);
  });

  it("builds its overlay when it has no container to mount in", () => {
    // The control for the assertion above: the same class is what the
    // package's own surface is built from.
    createSurface();

    const root = hostIn(document.body)?.shadowRoot?.querySelector(".root");
    expect(root?.classList.contains("overlay")).toBe(true);
  });

  it("gives a mode somewhere to mount, inside the root", () => {
    const surface = createSurface();
    const frame = document.createElement("iframe");

    surface.mount.append(frame);

    expect(hostIn(document.body)?.shadowRoot?.contains(frame)).toBe(true);
    expect(document.body.contains(frame)).toBe(false);
  });
});

describe("the loading state", () => {
  it("renders into the mount point", () => {
    const surface = createSurface();

    surface.showLoading();

    expect(surface.mount.textContent).not.toBe("");
  });

  it("is cleared when a mode mounts", () => {
    const surface = createSurface();
    surface.showLoading();

    surface.clear();

    expect(surface.mount.textContent).toBe("");
  });

  it("announces itself, rather than appearing as silent text", () => {
    const surface = createSurface();
    const region = surface.mount.querySelector("[role='status']");

    // Present before it has anything to say: a live region inserted
    // already-populated announces unreliably across screen readers.
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");

    surface.showLoading();

    expect(region?.textContent).not.toBe("");
  });

  it("keeps its live region across a mode mounting and a relaunch", () => {
    const surface = createSurface();
    const region = surface.mount.querySelector("[role='status']");
    surface.showLoading();

    surface.clear();

    expect(surface.mount.querySelector("[role='status']")).toBe(region);
  });
});

describe("holding what is mounted behind the loading state", () => {
  it("shows the loading state over it", () => {
    const surface = createSurface();
    surface.mount.append(document.createElement("iframe"));

    surface.hold();

    expect(surface.mount.classList.contains("held")).toBe(true);
    expect(surface.mount.querySelector(".status")?.textContent).toBe(
      "Loading…"
    );
  });

  it("lets it through on reveal, and empties the live region", () => {
    const surface = createSurface();
    surface.hold();

    surface.reveal();

    expect(surface.mount.classList.contains("held")).toBe(false);
    expect(surface.mount.classList.contains("loading")).toBe(false);
    expect(surface.mount.querySelector(".status")?.textContent).toBe("");
  });

  it("leaves anything it was not holding alone", () => {
    // Every `open` reveals, and in popup mode the window posts one too. The
    // affordance's sentence must survive it.
    const surface = createSurface();
    surface.showContinue(() => {});
    const sentence = surface.mount.querySelector(".status")?.textContent;

    surface.reveal();

    expect(surface.mount.querySelector(".status")?.textContent).toBe(sentence);
    expect(surface.mount.querySelector("button")).not.toBeNull();
  });

  it("drops the hold when the mount point is cleared", () => {
    const surface = createSurface();
    surface.hold();

    surface.clear();

    expect(surface.mount.classList.contains("held")).toBe(false);
    expect(surface.mount.classList.contains("loading")).toBe(false);
  });

  it("does nothing once destroyed", () => {
    const surface = createSurface();
    surface.destroy();

    expect(() => {
      surface.hold();
      surface.reveal();
    }).not.toThrow();
  });
});

describe("the continue affordance", () => {
  it("gives the user a real control, inside the root", () => {
    const surface = createSurface();

    surface.showContinue(() => {});

    const button = hostIn(document.body)?.shadowRoot?.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).not.toBe("");
    // Inside the boundary like everything else, so the caller's own button
    // styling neither reaches it nor is disturbed by it.
    expect(document.body.querySelector("button")).toBeNull();
  });

  it("says what is about to happen before it happens", () => {
    const surface = createSurface();

    surface.showContinue(() => {});

    const region = surface.mount.querySelector("[role='status']");
    expect(region?.textContent).toMatch(/new window/i);
  });

  it("claims nothing about why the frame was not used", () => {
    // The probe fails closed, so a failed request, a frame that never
    // loaded or a round trip past its budget all reach this copy on a
    // browser that would have carried the frame. Blaming the browser would
    // be telling the user something untrue, and the fallback works the
    // same either way.
    const surface = createSurface();

    surface.showContinue(() => {});

    const said = surface.mount.textContent ?? "";
    expect(said).not.toMatch(/browser|cookie|support|unable|can.t/i);
  });

  it("stays inside the surface it pads", () => {
    // The affordance is the only thing here with padding, and the panel is
    // already sized to fill its surface. There is deliberately no `*` reset
    // in this sheet, so without a border box the padding lands outside that
    // size and the panel outgrows the surface by twice the padding —
    // overflowing the caller's own container on an inline mount.
    //
    // jsdom has no layout engine, so this asserts the rule ships; the
    // overflow itself is on the real-browser list.
    const surface = createSurface();
    surface.showContinue(() => {});

    const css = cssOf(hostIn(document.body)?.shadowRoot);
    const panelRule = css.slice(
      css.indexOf(".panel {"),
      css.indexOf("}", css.indexOf(".panel {"))
    );
    expect(panelRule).toContain("box-sizing: border-box");
  });

  it("hands the activation straight to its caller", () => {
    // Straight through, with nothing in between: the caller spends this
    // activation on a `window.open`, and anything awaited between the two
    // turns that window into a blocked one. jsdom cannot prove the blocking
    // half — that is a real-browser check — so what is asserted here is
    // that the handler runs synchronously from the click.
    const surface = createSurface();
    let activations = 0;
    surface.showContinue(() => {
      activations += 1;
    });

    hostIn(document.body)
      ?.shadowRoot?.querySelector("button")
      ?.dispatchEvent(new MouseEvent("click"));

    expect(activations).toBe(1);
  });

  it("replaces the loading state rather than sitting under it", () => {
    const surface = createSurface();
    surface.showLoading();

    surface.showContinue(() => {});

    expect(surface.mount.textContent).not.toContain("Loading");
  });

  it("carries its own styles, since the boundary keeps the caller's out", () => {
    // A button in a shadow root inherits nothing from the host page, so an
    // unstyled one is what a caller would see if this rule went missing.
    const surface = createSurface();
    surface.showContinue(() => {});

    expect(cssOf(hostIn(document.body)?.shadowRoot)).toMatch(/\.continue\s*{/);
  });

  it("is cleared when a mode mounts over it", () => {
    const surface = createSurface();
    surface.showContinue(() => {});

    surface.clear();

    expect(surface.mount.querySelector("button")).toBeNull();
    expect(surface.mount.textContent).toBe("");
  });

  it("does nothing once the surface is gone", () => {
    const surface = createSurface();
    surface.destroy();

    expect(() => surface.showContinue(() => {})).not.toThrow();
    expect(hostIn(document.body)).toBeNull();
  });
});

describe("teardown", () => {
  it("removes the container it created", () => {
    const surface = createSurface();

    surface.destroy();

    expect(hostIn(document.body)).toBeNull();
    expect(document.body.childElementCount).toBe(0);
  });

  it("leaves the caller's own container in place", () => {
    const container = document.createElement("section");
    document.body.append(container);
    const surface = createSurface(container);

    surface.destroy();

    expect(document.body.contains(container)).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it("is idempotent", () => {
    const surface = createSurface();

    expect(() => {
      surface.destroy();
      surface.destroy();
    }).not.toThrow();
  });

  it("ignores rendering calls made after it", () => {
    const surface = createSurface();
    surface.destroy();

    expect(() => {
      surface.showLoading();
      surface.showContinue(() => {});
      surface.clear();
      surface.focus();
    }).not.toThrow();
    expect(hostIn(document.body)).toBeNull();
  });
});
