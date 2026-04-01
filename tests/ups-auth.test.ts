import { describe, it, expect, beforeEach } from "vitest";
import { UpsAuthProvider } from "../src/auth/ups-auth";
import { CarrierError, CarrierErrorCode } from "../src/types/errors";
import { StubHttpClient } from "./helpers/stub-http-client";
import tokenFixture from "./fixtures/ups-token-response.json";

const TOKEN_URL = "https://wwwcie.ups.com/security/v1/oauth/token";

function makeAuth(http: StubHttpClient) {
  return new UpsAuthProvider("test-id", "test-secret", http, TOKEN_URL);
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ...tokenFixture, ...overrides },
  };
}

describe("UpsAuthProvider", () => {
  let http: StubHttpClient;

  beforeEach(() => {
    http = new StubHttpClient();
  });

  it("fetches a token and returns the access_token", async () => {
    http.on("POST", TOKEN_URL, tokenResponse());
    const auth = makeAuth(http);

    const token = await auth.getToken();

    expect(token).toBe("test-access-token-abc123");
    expect(http.calls).toHaveLength(1);
  });

  it("returns the cached token on subsequent calls without re-fetching", async () => {
    http.on("POST", TOKEN_URL, tokenResponse());
    const auth = makeAuth(http);

    await auth.getToken();
    const token = await auth.getToken();

    expect(token).toBe("test-access-token-abc123");
    expect(http.calls).toHaveLength(1);
  });

  it("re-fetches after invalidate() clears the cache", async () => {
    http.on("POST", TOKEN_URL, tokenResponse());
    http.on("POST", TOKEN_URL, tokenResponse({ access_token: "refreshed-token" }));
    const auth = makeAuth(http);

    await auth.getToken();
    auth.invalidate();
    const token = await auth.getToken();

    expect(token).toBe("refreshed-token");
    expect(http.calls).toHaveLength(2);
  });

  it("throws AUTH_FAILED on a 401 response", async () => {
    http.on("POST", TOKEN_URL, { status: 401, headers: {}, body: {} });
    const auth = makeAuth(http);

    await expect(auth.getToken()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CarrierError && err.code === CarrierErrorCode.AUTH_FAILED,
    );
  });

  it("throws INVALID_RESPONSE when the token body fails schema validation", async () => {
    http.on("POST", TOKEN_URL, {
      status: 200,
      headers: {},
      body: { unexpected: "shape" },
    });
    const auth = makeAuth(http);

    await expect(auth.getToken()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CarrierError && err.code === CarrierErrorCode.INVALID_RESPONSE,
    );
  });
});
