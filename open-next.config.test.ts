/**
 * Smoke test for the OpenNext configuration.
 * The config itself is pure JSON-serialisable data — no logic to unit-test.
 * These tests verify the shape of the exported object.
 */

import { describe, it, expect } from "vitest";
import config from "./open-next.config";

describe("open-next config", () => {
  it("exports a non-null config object", () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });
});
