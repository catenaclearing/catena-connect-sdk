import { describe, expect, it } from "vitest";

import * as wrapper from "./index";

describe("connect-sdk-react public surface", () => {
  it("exports the hook, the component and the resume hook, and nothing else", () => {
    expect(Object.keys(wrapper).sort()).toEqual([
      "CatenaConnect",
      "useCatenaConnect",
      "useCatenaConnectResume",
    ]);
  });

  it("exports functions", () => {
    expect(typeof wrapper.CatenaConnect).toBe("function");
    expect(typeof wrapper.useCatenaConnect).toBe("function");
    expect(typeof wrapper.useCatenaConnectResume).toBe("function");
  });
});
