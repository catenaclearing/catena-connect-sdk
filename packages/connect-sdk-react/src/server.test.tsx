// @vitest-environment node

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CatenaConnect,
  useCatenaConnect,
  useCatenaConnectResume,
} from "./index";

// Not from test-utils, which mounts into a document this environment does not
// have. The values are the same ones the browser tests use.
const inviteUrl = "https://connect.example.com/invite/abc123";
const embedKey = "pk_test_key";

/** A page that uses both hooks, as a route component on the server would. */
function Page() {
  const { open } = useCatenaConnect({ inviteUrl, embedKey });
  useCatenaConnectResume({ outcome: "success" });
  return (
    <button type="button" onClick={open}>
      Connect
    </button>
  );
}

describe("rendering on the server", () => {
  it("has no window to touch", () => {
    expect(typeof window).toBe("undefined");
  });

  it("renders the component to its empty element", () => {
    let html = "";
    expect(() => {
      html = renderToString(
        <CatenaConnect
          inviteUrl={inviteUrl}
          embedKey={embedKey}
          className="x"
        />
      );
    }).not.toThrow();

    expect(html).toContain("<div");
    expect(html).toContain('class="x"');
  });

  it("renders a page using both hooks", () => {
    let html = "";
    expect(() => {
      html = renderToString(<Page />);
    }).not.toThrow();

    expect(html).toContain("<button");
  });
});
