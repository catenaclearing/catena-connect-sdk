import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type Mounted, mount } from "./test-utils";
import {
  type UseCatenaConnectResumeOptions,
  useCatenaConnectResume,
} from "./use-catena-connect-resume";

/**
 * The record redirect mode leaves behind, written the way the core writes it.
 *
 * Mirrored rather than imported: the writer is internal to the core, and the
 * key and marker it uses are part of what these tests must not drift from.
 * The core's `pending.ts` is the source of truth for both.
 */
const STORAGE_KEY = "catena-connect.pending";
const SCHEMA = "catena-connect.pending/1";

function plantRecord(): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schema: SCHEMA,
      id: "test-launch",
      expires: Date.now() + 60_000,
    })
  );
}

/** The hook on the page a redirected flow returns to. */
function ReturnPage(options: UseCatenaConnectResumeOptions) {
  useCatenaConnectResume(options);
  return <p>Welcome back</p>;
}

const mounted: Mounted[] = [];

function render(element: Parameters<typeof mount>[0]): Mounted {
  const result = mount(element);
  mounted.push(result);
  return result;
}

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  sessionStorage.clear();
});

describe("useCatenaConnectResume", () => {
  it("reports success once, then the dismissal", () => {
    plantRecord();
    const order: string[] = [];
    const onSuccess = vi.fn(() => order.push("success"));
    const onClose = vi.fn(() => order.push("close"));

    render(
      <ReturnPage outcome="success" onSuccess={onSuccess} onClose={onClose} />
    );

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["success", "close"]);
  });

  it("reports once under strict mode, which mounts twice", () => {
    plantRecord();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <StrictMode>
        <ReturnPage outcome="success" onSuccess={onSuccess} onClose={onClose} />
      </StrictMode>
    );

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports nothing further on a re-render", () => {
    plantRecord();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const root = render(
      <ReturnPage outcome="success" onSuccess={onSuccess} onClose={onClose} />
    );

    root.rerender(
      <ReturnPage outcome="success" onSuccess={onSuccess} onClose={onClose} />
    );

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports an exit with no reason, then the dismissal", () => {
    plantRecord();
    const order: string[] = [];
    const onExit = vi.fn(() => order.push("exit"));
    const onClose = vi.fn(() => order.push("close"));

    render(<ReturnPage outcome="exit" onExit={onExit} onClose={onClose} />);

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith({ reason: "" });
    expect(order).toEqual(["exit", "close"]);
  });

  it("reports nothing while no launch is pending", () => {
    const onSuccess = vi.fn();
    const onExit = vi.fn();
    const onClose = vi.fn();

    render(
      <ReturnPage
        outcome="success"
        onSuccess={onSuccess}
        onExit={onExit}
        onClose={onClose}
      />
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
