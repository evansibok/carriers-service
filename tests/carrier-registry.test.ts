import { describe, it, expect, beforeEach } from "vitest";
import { CarrierRegistry } from "../src/carriers/CarrierRegistry";
import { FedExCarrier } from "../src/carriers/fedex/FedExCarrier";
import { CarrierError, CarrierErrorCode } from "../src/types/errors";
import { StubHttpClient } from "./helpers/stub-http-client";
import { UpsCarrier } from "../src/carriers/ups/UpsCarrier";
import { UpsAuthProvider } from "../src/auth/ups-auth";

const BASE_URL = "https://wwwcie.ups.com";
const TOKEN_URL = `${BASE_URL}/security/v1/oauth/token`;

function makeUpsCarrier() {
  const http = new StubHttpClient();
  const auth = new UpsAuthProvider("id", "secret", http, TOKEN_URL);
  return new UpsCarrier(auth, http, BASE_URL);
}

describe("CarrierRegistry", () => {
  let registry: CarrierRegistry;

  beforeEach(() => {
    registry = new CarrierRegistry();
  });

  it("register + get returns the registered carrier by id", () => {
    const ups = makeUpsCarrier();
    registry.register(ups);

    expect(registry.get("ups")).toBe(ups);
  });

  it("get with an unknown carrierId throws CARRIER_NOT_FOUND", () => {
    let caught: unknown;
    try { registry.get("dhl"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(CarrierError);
    expect((caught as CarrierError).code).toBe(CarrierErrorCode.CARRIER_NOT_FOUND);
  });

  it("getAll returns every registered carrier", () => {
    registry.register(makeUpsCarrier());
    registry.register(new FedExCarrier());

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.carrierId)).toEqual(
      expect.arrayContaining(["ups", "fedex"]),
    );
  });

  it("re-registering the same carrierId overwrites the previous entry", () => {
    const ups1 = makeUpsCarrier();
    const ups2 = makeUpsCarrier();
    registry.register(ups1);
    registry.register(ups2);

    expect(registry.get("ups")).toBe(ups2);
    expect(registry.getAll()).toHaveLength(1);
  });
});
