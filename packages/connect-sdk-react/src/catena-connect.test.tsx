import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatenaConnect } from "./catena-connect";
import {
  deliver,
  embedKey,
  frameIn,
  inviteUrl,
  type Mounted,
  mount,
  settled,
  successMessage,
  surfacesIn,
} from "./test-utils";

const mounted: Mounted[] = [];

function render(element: Parameters<typeof mount>[0]): Mounted {
  const result = mount(element);
  mounted.push(result);
  return result;
}

/** The one element the component rendered. */
function hostIn(root: Mounted): HTMLDivElement {
  const host = root.container.firstElementChild;
  if (!(host instanceof HTMLDivElement)) {
    throw new Error("the component did not render a div");
  }
  return host;
}

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  document.body.replaceChildren();
});

describe("CatenaConnect", () => {
  it("renders one div carrying the attributes it was given", async () => {
    const root = render(
      <CatenaConnect
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        className="connect"
        style={{ height: 600 }}
        id="connect-flow"
        data-testid="connect"
      />
    );

    expect(root.container.children).toHaveLength(1);
    const host = hostIn(root);
    expect(host.className).toBe("connect");
    expect(host.style.height).toBe("600px");
    expect(host.id).toBe("connect-flow");
    expect(host.dataset.testid).toBe("connect");
    await settled();
  });

  it("keeps launch options off the div and attributes off the launch", async () => {
    const root = render(
      <CatenaConnect
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        variant="card"
        title="Connect a provider"
      />
    );
    await settled();
    const host = hostIn(root);
    const [surface] = surfacesIn(host);
    const params = new URL(frameIn(surface).src).searchParams;

    expect(host.hasAttribute("variant")).toBe(false);
    expect(host.title).toBe("Connect a provider");
    expect(params.get("variant")).toBe("card");
    expect(params.has("title")).toBe(false);
  });

  it("treats a prop that shadows Object.prototype as an attribute", async () => {
    // `constructor` is on every object's prototype. It is not a launch
    // option, so it belongs on the element with the other attributes.
    const shadowing = { constructor: "shadowed" } as Record<string, string>;
    const root = render(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} {...shadowing} />
    );

    expect(hostIn(root).getAttribute("constructor")).toBe("shadowed");
    await settled();
  });

  it("puts no caller content inside the element", async () => {
    // Both are left out of the props type. A caller outside TypeScript can
    // still pass them, and they must not reach the element.
    const content = {
      children: <span data-testid="child" />,
      dangerouslySetInnerHTML: { __html: "<b data-testid='markup'></b>" },
    } as Record<string, unknown>;
    const root = render(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} {...content} />
    );
    await settled();
    const host = hostIn(root);

    expect(host.querySelector("[data-testid]")).toBeNull();
    expect(surfacesIn(host)).toHaveLength(1);
    expect(host.children).toHaveLength(1);
  });

  it("keeps its own ref on the element when a caller passes one", async () => {
    // React 19 hands `ref` to a function component as a plain prop. Spread
    // onto the div it would replace the ref the flow mounts through, and the
    // flow would open in the overlay instead.
    const theirs = { ref: () => {} } as Record<string, unknown>;
    const root = render(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} {...theirs} />
    );

    expect(surfacesIn(hostIn(root))).toHaveLength(1);
    expect(surfacesIn(document.body)).toHaveLength(0);
    await settled();
  });

  it("launches inline into its own div on mount", async () => {
    const root = render(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} />
    );

    expect(surfacesIn(hostIn(root))).toHaveLength(1);
    expect(surfacesIn(document.body)).toHaveLength(0);
    await settled();
  });

  it("tears the launch down and leaves nothing behind on unmount", async () => {
    const root = render(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    await settled();
    const host = hostIn(root);
    expect(surfacesIn(host)).toHaveLength(1);

    root.unmount();

    expect(host.isConnected).toBe(false);
    expect(surfacesIn(host)).toHaveLength(0);
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("shows one surface after a strict-mode mount", async () => {
    const root = render(
      <StrictMode>
        <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} />
      </StrictMode>
    );

    expect(surfacesIn(hostIn(root))).toHaveLength(1);
    expect(surfacesIn(document.body)).toHaveLength(0);
    await settled();
  });

  it("keeps the launch when a presentation prop changes", async () => {
    const root = render(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} variant="full" />
    );
    await settled();
    const [surface] = surfacesIn(hostIn(root));
    const src = frameIn(surface).src;

    root.rerender(
      <CatenaConnect inviteUrl={inviteUrl} embedKey={embedKey} variant="card" />
    );
    await settled();

    expect(surfacesIn(hostIn(root))).toEqual([surface]);
    expect(frameIn(surface).src).toBe(src);
  });

  it("relaunches when its key changes", async () => {
    const root = render(
      <CatenaConnect key="a" inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    await settled();
    const [surface] = surfacesIn(hostIn(root));

    root.rerender(
      <CatenaConnect key="b" inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    await settled();

    const [next] = surfacesIn(hostIn(root));
    expect(next).toBeDefined();
    expect(next).not.toBe(surface);
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("delivers to the handler from the latest render", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const root = render(
      <CatenaConnect
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        onSuccess={first}
      />
    );
    await settled();
    const [surface] = surfacesIn(hostIn(root));

    root.rerender(
      <CatenaConnect
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        onSuccess={second}
      />
    );
    deliver(successMessage(["c1"]), frameIn(surface).contentWindow);

    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ connectionIds: ["c1"] });
    expect(first).not.toHaveBeenCalled();
  });
});
