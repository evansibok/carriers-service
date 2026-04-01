import { describe, it, expect, beforeEach } from "vitest";
import { UpsCarrier } from "../src/carriers/ups/UpsCarrier";
import { UpsAuthProvider } from "../src/auth/ups-auth";
import { CarrierError, CarrierErrorCode } from "../src/types/errors";
import { WeightUnit } from "../src/types/domain";
import { StubHttpClient } from "./helpers/stub-http-client";
import tokenFixture from "./fixtures/ups-token-response.json";
import shopResponse from "./fixtures/ups-rate-shop-response.json";
import error422 from "./fixtures/ups-error-422.json";
import error429 from "./fixtures/ups-error-429.json";

const BASE_URL = "https://wwwcie.ups.com";
const TOKEN_URL = `${BASE_URL}/security/v1/oauth/token`;
const SHOP_URL = `${BASE_URL}/api/rating/v2409/Shop`;
const RATE_URL = `${BASE_URL}/api/rating/v2409/Rate`;

const okToken = { status: 200, headers: {}, body: tokenFixture };
const okShop = { status: 200, headers: {}, body: shopResponse };

const baseRequest = {
  origin: {
    addressLines: ["123 Main St"],
    city: "Atlanta",
    stateCode: "GA",
    postalCode: "30301",
    countryCode: "US",
  },
  destination: {
    addressLines: ["456 Oak Ave"],
    city: "Los Angeles",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US",
  },
  packages: [{ weight: { value: 5, unit: WeightUnit.LBS } }],
};

function makeCarrier(http: StubHttpClient) {
  const auth = new UpsAuthProvider("id", "secret", http, TOKEN_URL);
  return new UpsCarrier(auth, http, BASE_URL);
}

describe("UpsCarrier.getRates", () => {
  let http: StubHttpClient;

  beforeEach(() => {
    http = new StubHttpClient();
  });

  it("happy path: Shop mode returns normalised RateQuote[] with numeric amounts", async () => {
    http.on("POST", TOKEN_URL, okToken).on("POST", SHOP_URL, okShop);
    const carrier = makeCarrier(http);

    const quotes = await carrier.getRates(baseRequest);

    const shopCall = http.calls.find((c) => c.url === SHOP_URL);
    expect(shopCall).toBeDefined();
    expect((shopCall?.body as Record<string, unknown>)?.RateRequest).toBeDefined();
    expect(quotes.length).toBeGreaterThan(0);
    expect(typeof quotes[0]?.totalCharge.amount).toBe("number");
    expect(quotes[0]?.carrierId).toBe("ups");
  });

  it("mode routing: serviceCode triggers Rate endpoint and token is reused across calls", async () => {
    http
      .on("POST", TOKEN_URL, okToken)
      .on("POST", RATE_URL, okShop)
      .on("POST", RATE_URL, okShop);
    const carrier = makeCarrier(http);

    const request = { ...baseRequest, serviceCode: "03" };
    await carrier.getRates(request);
    await carrier.getRates(request);

    const authCalls = http.calls.filter((c) => c.url === TOKEN_URL);
    const rateCalls = http.calls.filter((c) => c.url === RATE_URL);
    expect(authCalls).toHaveLength(1);
    expect(rateCalls).toHaveLength(2);
    expect(rateCalls[0]?.headers?.["Authorization"]).toMatch(/^Bearer /);
  });

  it("auth refresh: 401 from rating triggers invalidate + retry; double 401 throws TOKEN_REFRESH_FAILED", async () => {
    http
      .on("POST", TOKEN_URL, okToken)
      .on("POST", SHOP_URL, { status: 401, headers: {}, body: {} })
      .on("POST", TOKEN_URL, okToken)
      .on("POST", SHOP_URL, okShop);
    const carrier = makeCarrier(http);

    const quotes = await carrier.getRates(baseRequest);
    expect(quotes.length).toBeGreaterThan(0);

    const http2 = new StubHttpClient();
    http2
      .on("POST", TOKEN_URL, okToken)
      .on("POST", SHOP_URL, { status: 401, headers: {}, body: {} })
      .on("POST", TOKEN_URL, okToken)
      .on("POST", SHOP_URL, { status: 401, headers: {}, body: {} });
    const carrier2 = makeCarrier(http2);

    await expect(carrier2.getRates(baseRequest)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CarrierError &&
        err.code === CarrierErrorCode.TOKEN_REFRESH_FAILED,
    );
  });

  it("error codes: 429 → RATE_LIMITED, 500 → SERVER_ERROR, 422 → UPSTREAM_ERROR, bad body → INVALID_RESPONSE", async () => {
    async function expectCode(
      stub: StubHttpClient,
      code: CarrierErrorCode,
    ) {
      const carrier = makeCarrier(stub);
      await expect(carrier.getRates(baseRequest)).rejects.toSatisfy(
        (err: unknown) => err instanceof CarrierError && err.code === code,
      );
    }

    const make429 = () =>
      new StubHttpClient()
        .on("POST", TOKEN_URL, okToken)
        .on("POST", SHOP_URL, { status: 429, headers: {}, body: error429 });

    const make500 = () =>
      new StubHttpClient()
        .on("POST", TOKEN_URL, okToken)
        .on("POST", SHOP_URL, { status: 500, headers: {}, body: {} });

    const make422 = () =>
      new StubHttpClient()
        .on("POST", TOKEN_URL, okToken)
        .on("POST", SHOP_URL, { status: 422, headers: {}, body: error422 });

    const makeBadBody = () =>
      new StubHttpClient()
        .on("POST", TOKEN_URL, okToken)
        .on("POST", SHOP_URL, { status: 200, headers: {}, body: { unexpected: true } });

    await expectCode(make429(), CarrierErrorCode.RATE_LIMITED);
    await expectCode(make500(), CarrierErrorCode.SERVER_ERROR);
    await expectCode(make422(), CarrierErrorCode.UPSTREAM_ERROR);
    await expectCode(makeBadBody(), CarrierErrorCode.INVALID_RESPONSE);
  });

  it("input validation: empty packages array throws VALIDATION_ERROR before any HTTP call", async () => {
    const carrier = makeCarrier(http);
    const invalid = { ...baseRequest, packages: [] };

    await expect(carrier.getRates(invalid)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CarrierError &&
        err.code === CarrierErrorCode.VALIDATION_ERROR,
    );
    expect(http.calls).toHaveLength(0);
  });
});
