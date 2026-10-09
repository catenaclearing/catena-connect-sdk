/**
 * The surface a launch renders into: our own overlay, or the caller's
 * container when they supplied one.
 *
 * Every style lives inside a shadow root, which is the only mechanism that
 * gives both halves of the isolation requirement: the host page's rules do not
 * cross in, and ours cannot escape. A prefixed-class convention would give the
 * second half only, and would be useless against a host page whose `*` and
 * bare `div` rules apply whatever we name our classes.
 *
 * The boundary does not cover the host element itself, which lives in the
 * host document and is matched by their rules. For normal declarations
 * the outer tree wins, so `:host { display: block }` loses to a host page's
 * `div { display: none }` and the surface disappears. Importance reverses that
 * order, so the few declarations we cannot survive losing are marked
 * `!important` — and only those.
 */

const STYLES = `
  :host {
    all: initial !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  /* An inline mount's host has to be sized, and it has to be sized from in
     here: for important declarations the inner tree wins, so this stylesheet's
     own "all: initial" beats an important inline style on the host itself.
     Scoped by an attribute the host carries only when mounted inline, because
     the overlay's host sits in the host page's body and a viewport-tall block
     there would push their page down. */
  :host([data-inline]) {
    width: 100% !important;
    height: 100% !important;
  }

  .root {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 480px;
    box-sizing: border-box;
    font-family: system-ui, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
  }

  .root.overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    min-height: 0;
    background: rgba(0, 0, 0, 0.5);
  }

  .panel {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    /* Stated here because this sheet carries no universal selector. Without
       it the affordance's padding lands outside a panel already sized to
       100%, and the panel outgrows the surface by twice that padding. */
    box-sizing: border-box;
    overflow: hidden;
    background: #ffffff;
  }

  .root.overlay .panel {
    width: min(100%, 460px);
    height: min(100%, 720px);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  }

  .status {
    font-size: 14px;
    line-height: 1.4;
    color: #555555;
  }

  /* The loading state stacks a spinner above its sentence. The sentence stays
     for a screen reader, and for anyone with motion reduced, who is shown the
     ring standing still. */
  .panel.loading .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .panel.loading .status::before {
    content: "";
    width: 24px;
    height: 24px;
    box-sizing: border-box;
    border: 2px solid #e0e0e0;
    border-top-color: #555555;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel.loading .status::before {
      animation: none;
    }
  }

  /* A held frame is mounted and loading, but not shown: the loading state
     sits over the space it fills until the flow says it is ready. Hidden
     rather than removed or left unmounted, because a frame has to be in the
     document to load, and the point is that it loads behind the spinner. */
  .panel.held {
    position: relative;
  }

  .panel.held .frame {
    visibility: hidden;
  }

  .panel.held .status {
    position: absolute;
    inset: 0;
    justify-content: center;
  }

  /* The affordance stacks its sentence above its control, where the loading
     state is a single centered line. */
  .panel.offered {
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    text-align: center;
  }

  .panel.offered .status {
    max-width: 34ch;
    font-size: 15px;
    color: #1a1a1a;
  }

  /* Styled from nothing on purpose: the shadow boundary keeps the host page's
     rules out, so a button in here starts from the browser default. */
  .continue {
    font-family: inherit;
    font-size: 15px;
    line-height: 1;
    padding: 12px 24px;
    border: 0;
    border-radius: 8px;
    background: #1a1a1a;
    color: #ffffff;
    cursor: pointer;
  }

  .continue:focus-visible {
    outline: 2px solid #1a1a1a;
    outline-offset: 2px;
  }

  /* Present from the start so it can announce, taking no space until it has
     something to say. */
  .status:empty {
    display: none;
  }

  /* The frame fills whatever surface it was mounted in, and the flow lays
     itself out at that size. We never measure the flow or resize the frame to
     fit it: that needs a cross-origin protocol the contract does not define,
     and would tie this package to the app's layout forever. */
  .frame {
    display: block;
    width: 100%;
    height: 100%;
    /* Stretched as well as sized: the overlay's panel has a definite height
       to take a percentage of, an inline mount's is stretched to fit. */
    align-self: stretch;
    border: 0;
  }

  /* An inline mount has no definite height above the frame — the overlay gets
     one from being fixed to the viewport, the inline root gets nothing. A
     percentage height against a parent sized by its content resolves to auto,
     the chain collapses, and the frame falls back to an iframe's intrinsic
     height: a short strip instead of the space the caller reserved.
     Stretching the panel to the root gives it something real to fill. */
  .root:not(.overlay) .panel {
    align-self: stretch;
    height: auto;
  }
`;

/** What the loading state says beside its spinner. */
const LOADING_MESSAGE = "Loading…";

/**
 * What the user is told before a window opens.
 *
 * It describes what the next click does and claims nothing about why. An
 * unsupported verdict is not a finding about the browser: the probe fails
 * closed, so a failed request or an exhausted budget land here too, on a
 * browser that would have carried the frame fine. Saying "your browser cannot
 * do this" would often be untrue. What is true on every path is that a window
 * is about to open and they are the one opening it.
 */
const CONTINUE_MESSAGE = "Continue in a new window to finish connecting.";
const CONTINUE_LABEL = "Continue";

export interface Surface {
  /**
   * Where a mode mounts its frame or its continue affordance. Inside the
   * shadow root, so anything put here is isolated too.
   */
  readonly mount: HTMLElement;
  /** Show the loading state. What a launch renders while it resolves. */
  showLoading(message?: string): void;
  /**
   * Keep the loading state over what was just put in the mount point, which
   * stays hidden until `reveal()`. A frame is blank until the page inside it
   * has drawn, and that takes seconds, not the instant mounting it does.
   */
  hold(): void;
  /**
   * Take the loading state off a held mount point. Does nothing when nothing
   * is held, so it is safe to call on every signal that the flow is ready.
   */
  reveal(): void;
  /**
   * Show what is about to happen and give the user something to click.
   *
   * `onActivate` is called straight out of the click handler with nothing in
   * between, because the caller spends that activation on a `window.open`.
   */
  showContinue(onActivate: () => void): void;
  /** Empty the mount point without tearing the surface down. */
  clear(): void;
  /**
   * Bring an already-live surface back to attention, when it is one we own.
   * Inside a caller's container this does nothing.
   */
  focus(): void;
  /** Remove everything this surface created. Idempotent. */
  destroy(): void;
}

/**
 * Create the surface. With a container we render inline inside it, without one
 * we render our own overlay on the document. Behavior is identical either way,
 * which keeps an inline mount from being a special case anywhere else.
 */
export function createSurface(container?: HTMLElement): Surface {
  // The container's own document, which is not always the one this package
  // was loaded in: a page can call us from its top window and hand over an
  // element inside a same-origin frame. Everything is built from that
  // document, because a constructed stylesheet only applies in the document
  // that made it. Built here and moved across, the host is adopted into the
  // frame's document and the browser drops the sheet without a word, leaving
  // an unstyled frame at its default 300 by 150.
  const doc = container?.ownerDocument ?? document;

  const host = doc.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });

  applyStyles(shadow, doc);

  const overlay = container === undefined;

  const root = doc.createElement("div");
  root.className = overlay ? "root overlay" : "root";
  root.tabIndex = -1;

  if (overlay) {
    // Only our own overlay claims to be a modal. A caller's container sits
    // in a layout they built and may not be modal at all; announcing it as
    // one, or pulling focus, would be overruling them about their own page.
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Catena Connect");
  }

  // Whoever was focused when the overlay went up gets it back when it comes
  // down. Otherwise the user is dumped at the top of the host page.
  const previouslyFocused = overlay ? activeElement() : null;

  const panel = doc.createElement("div");
  panel.className = "panel";

  // A live region, in the document before it has anything to announce.
  // Inserting an already-populated one is unreliable across screen readers:
  // the region has to be there for the change to register as a change.
  const status = doc.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  panel.append(status);

  root.append(panel);
  shadow.append(root);

  // Nothing else gives the host a size, and without one `.root`'s percentage
  // resolves against `auto`, the chain collapses to `min-height`, and an
  // inline mount ignores the space the caller reserved: 480px tall in a
  // container they gave 800. The sizing itself is a `:host([data-inline])`
  // rule in the stylesheet above — not an inline style here, which this
  // stylesheet's own `all: initial !important` would beat, since important
  // declarations from the inner tree outrank the outer's. This attribute is
  // what that rule keys on.
  //
  // The overlay needs none of it: `.root.overlay` is fixed to the viewport
  // and takes its size from there.
  if (!overlay) {
    host.setAttribute("data-inline", "");
  }

  (container ?? document.body).append(host);

  // `aria-modal` tells a screen reader the rest of the page is not there.
  // Nothing made that true for the keyboard, so Tab still walked out of the
  // overlay and into controls the user could no longer see — the
  // announcement and the behavior disagreeing.
  //
  // `inert` rather than a focus trap, because the flow is a cross-origin
  // frame: its focusable elements cannot be enumerated from here, so there is
  // no ring of our own to cycle. Taking the rest of the document out of the
  // tab order leaves the browser cycling within the frame, which it already
  // does correctly.
  //
  // Anything already inert is left out of the list and never restored: a
  // caller who launched us from inside their own modal gets their page back
  // the way they had it.
  const inerted: HTMLElement[] = [];

  let watcher: MutationObserver | null = null;

  const inertEverythingElse = (): void => {
    // The surface can leave the document without us — a caller unmounting
    // the component around it, or replacing the page wholesale. Nothing of
    // ours is up any more, so there is nothing to keep out of the tab order
    // and no reason to go on touching their page. `destroy()` is the
    // supported way down; this is the one that does not involve us, and it
    // has to give the page back the same way: a caller who removed only our
    // host would otherwise keep every sibling we marked inert, with no
    // overlay on screen to explain why the keyboard reaches nothing.
    if (!host.isConnected) {
      watcher?.disconnect();
      for (const element of inerted) {
        element.inert = false;
      }
      inerted.length = 0;
      return;
    }

    for (const sibling of Array.from(document.body.children)) {
      if (sibling === host || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert) continue;

      sibling.inert = true;
      inerted.push(sibling);
    }
  };

  // The page behind a modal does not hold still. A caller's toast, a route
  // change, their own portal: anything appended while we are up arrives
  // focusable and outside the set taken out of the tab order, which is the
  // same disagreement between the announcement and the behavior, reopened by
  // their next render.
  //
  // `childList` on `body` only. Anything deeper is already inside a subtree
  // this has covered, since `inert` is inherited.
  if (overlay) {
    inertEverythingElse();

    if (typeof MutationObserver === "function") {
      watcher = new MutationObserver(inertEverythingElse);
      watcher.observe(document.body, { childList: true });
    }
  }

  // After appending, because an element outside the document cannot be
  // focused. Without this the user is left on the page behind the overlay,
  // tabbing through content they can no longer see.
  if (overlay) {
    root.focus({ preventScroll: true });
  }

  let destroyed = false;

  /**
   * Take the mount point back to empty. The live region survives: a region
   * recreated on every change announces less reliably than one that was
   * always there.
   */
  const reset = (): void => {
    panel.replaceChildren(status);
    panel.classList.remove("offered", "loading", "held");
    status.textContent = "";
  };

  return {
    mount: panel,

    showLoading(message = LOADING_MESSAGE) {
      if (destroyed) return;
      panel.classList.add("loading");
      status.textContent = message;
    },

    hold() {
      if (destroyed) return;
      panel.classList.add("loading", "held");
      status.textContent = LOADING_MESSAGE;
    },

    reveal() {
      if (destroyed || !panel.classList.contains("held")) return;
      panel.classList.remove("held", "loading");
      // Emptied rather than reworded: the flow announces itself, and a region
      // still saying "Loading…" over it would be untrue.
      status.textContent = "";
    },

    showContinue(onActivate) {
      if (destroyed) return;
      reset();

      // The sentence goes in the live region rather than beside it, so a
      // screen reader hears the surface change from loading to this instead
      // of being left on a "Loading…" that stopped being true.
      status.textContent = CONTINUE_MESSAGE;
      panel.classList.add("offered");

      const button = doc.createElement("button");
      button.type = "button";
      button.className = "continue";
      button.textContent = CONTINUE_LABEL;
      // Straight through, with nothing between the activation and what the
      // handler does with it. The caller spends this activation on a
      // `window.open`, and anything awaited in between blocks that window.
      button.addEventListener("click", () => {
        onActivate();
      });
      panel.append(button);
    },

    clear() {
      if (destroyed) return;
      reset();
    },

    focus() {
      if (destroyed) return;
      // Only the overlay, for the same reason it is the only surface that
      // takes focus when it opens. An inline surface is already sitting in
      // the host page where the user left it.
      if (!overlay) return;
      root.focus({ preventScroll: true });
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      // Stopped before the restore, or the observer would inert the page
      // again on its way out.
      watcher?.disconnect();

      // Before the focus restore below, which cannot land on an element that
      // is still inert.
      for (const element of inerted) {
        element.inert = false;
      }

      // The host element is ours. The container, when there is one, is the
      // caller's and is left exactly as we found it.
      host.remove();
      if (isFocusable(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    },
  };
}

/**
 * What actually has focus, rather than what the document admits to.
 *
 * `document.activeElement` stops at a shadow host, so a launch button inside
 * a caller's own component reports the component instead of the button.
 * Restoring focus there would land the user somewhere they never were, so we
 * follow each open root down to the real control. A closed root ends the
 * descent, which is the point of closing it.
 */
function activeElement(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/**
 * Whether focus can be handed back to this element.
 *
 * Asked structurally rather than by class: an SVG element with a `tabindex`
 * can hold focus and has `focus()` but is not an `HTMLElement`, and an icon
 * button drawn as SVG is an ordinary thing to launch from.
 *
 * It may also have been removed in the meantime — a host SPA re-rendering
 * behind the overlay is the usual way that happens.
 */
function isFocusable(element: Element | null): element is Element & {
  focus: (options?: FocusOptions) => void;
} {
  return (
    element?.isConnected === true &&
    typeof (element as Partial<HTMLElement>).focus === "function"
  );
}

/**
 * Put the surface's styles in the shadow root without needing the caller's
 * Content Security Policy to allow inline styles.
 *
 * A constructable stylesheet is CSSOM rather than an inline `<style>`, so
 * `style-src` does not gate it. A caller strict enough to omit
 * `unsafe-inline` would otherwise get an unstyled overlay — including losing
 * the `!important` host declarations that stop their page hiding it, so the
 * isolation would fail exactly where it is needed most.
 *
 * The `<style>` fallback is for browsers without constructable sheets, which
 * are older than anything frame mode supports anyway.
 */
function applyStyles(shadow: ShadowRoot, doc: Document): void {
  try {
    // That window's constructor, not ours: a sheet constructed in one
    // document cannot be adopted by a shadow root in another.
    const Sheet = doc.defaultView?.CSSStyleSheet ?? CSSStyleSheet;
    const sheet = new Sheet();
    sheet.replaceSync(STYLES);
    shadow.adoptedStyleSheets = [sheet];
    return;
  } catch {
    // Fall through to the element.
  }

  const style = doc.createElement("style");
  style.textContent = STYLES;
  shadow.append(style);
}
