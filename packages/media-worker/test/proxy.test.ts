import { describe, expect, test } from "vitest";

import { calculateProxyDimensions } from "../src/proxy";

describe("proxy dimensions", () => {
  test("preserves aspect ratio while clamping the larger dimension", () => {
    expect(calculateProxyDimensions(1920, 1080)).toEqual({
      width: 960,
      height: 540
    });
    expect(calculateProxyDimensions(1080, 1920)).toEqual({
      width: 540,
      height: 960
    });
    expect(calculateProxyDimensions(320, 180)).toEqual({
      width: 320,
      height: 180
    });
  });
});
