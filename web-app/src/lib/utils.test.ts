import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cn,
  getRequiredEnvironmentVariable,
  isPreSignedURLStillValid,
} from "@/lib/utils";

describe("cn", () => {
  it("combines truthy classes and resolves conflicting tailwind utilities", () => {
    expect(cn("px-2", undefined, "py-1", "px-4", false && "hidden")).toBe(
      "py-1 px-4",
    );
  });
});

describe("getRequiredEnvironmentVariable", () => {
  const variableName = "TEST_REQUIRED_ENVIRONMENT_VARIABLE";

  afterEach(() => {
    delete process.env[variableName];
  });

  it("returns the configured environment variable value", () => {
    process.env[variableName] = "configured-value";

    expect(getRequiredEnvironmentVariable(variableName)).toBe(
      "configured-value",
    );
  });

  it("throws when the environment variable is missing", () => {
    expect(() => getRequiredEnvironmentVariable(variableName)).toThrow(
      `Missing required environment variable: ${variableName}`,
    );
  });
});

describe("isPreSignedURLStillValid", () => {
  const uploadUrl =
    "https://example.com/upload?X-Amz-Date=20260326T193627Z&X-Amz-Expires=300";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when the presigned url is still valid for more than one minute", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 26, 19, 39, 0));

    expect(isPreSignedURLStillValid(uploadUrl)).toBe(true);
  });

  it("returns false when the presigned url has less than one minute remaining", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 26, 19, 40, 28));

    expect(isPreSignedURLStillValid(uploadUrl)).toBe(false);
  });

  it("throws when the presigned url is missing required signature parameters", () => {
    expect(() =>
      isPreSignedURLStillValid("https://example.com/upload?X-Amz-Date=20260326T193627Z"),
    ).toThrow("Invalid pre-signed URL: missing required parameters");
  });
});
