import { describe, it, expect } from "vitest";
import { toUpsRateRequest, fromUpsRateResponse } from "../../src/carriers/ups/ups-mapper";
import { UpsRateResponseSchema } from "../../src/schemas/ups.schemas";
import { WeightUnit, DimensionUnit } from "../../src/types/domain";
import shopResponse from "../fixtures/ups-rate-shop-response.json";
import singleResponse from "../fixtures/ups-rate-single-response.json";

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
  packages: [
    { weight: { value: 5, unit: WeightUnit.LBS } },
  ],
};

describe("toUpsRateRequest", () => {
  it("builds a Shop request when no serviceCode is given", () => {
    const result = toUpsRateRequest(baseRequest, "Shop");

    expect(result.RateRequest.Request.RequestOption).toBe("Shop");
    expect(result.RateRequest.Shipment).not.toHaveProperty("Service");
  });

  it("builds a Rate request and includes Service when serviceCode is given", () => {
    const result = toUpsRateRequest({ ...baseRequest, serviceCode: "03" }, "Rate");

    expect(result.RateRequest.Request.RequestOption).toBe("Rate");
    expect(result.RateRequest.Shipment["Service"]).toEqual({ Code: "03" });
  });

  it("includes PaymentDetails in every request", () => {
    const result = toUpsRateRequest(baseRequest, "Shop");

    expect(result.RateRequest.Shipment["PaymentDetails"]).toBeDefined();
  });

  it("maps package dimensions when provided", () => {
    const request = {
      ...baseRequest,
      packages: [
        {
          weight: { value: 3, unit: WeightUnit.LBS },
          dimensions: { length: 10, width: 8, height: 6, unit: DimensionUnit.IN },
        },
      ],
    };
    const result = toUpsRateRequest(request, "Shop");
    const pkg = (result.RateRequest.Shipment["Package"] as unknown[])[0] as Record<string, unknown>;

    expect(pkg["Dimensions"]).toMatchObject({
      Length: "10",
      Width: "8",
      Height: "6",
      UnitOfMeasurement: { Code: "IN" },
    });
  });

  it("sets ResidentialAddressIndicator when destination isResidential", () => {
    const request = {
      ...baseRequest,
      destination: { ...baseRequest.destination, isResidential: true },
    };
    const result = toUpsRateRequest(request, "Shop");
    const shipTo = result.RateRequest.Shipment["ShipTo"] as Record<string, unknown>;
    const address = shipTo["Address"] as Record<string, unknown>;

    expect(address).toHaveProperty("ResidentialAddressIndicator", "");
  });
});

describe("fromUpsRateResponse", () => {
  it("normalises a RatedShipment array into multiple RateQuotes", () => {
    const parsed = UpsRateResponseSchema.parse(shopResponse);
    const quotes = fromUpsRateResponse(parsed, "ups");

    expect(quotes).toHaveLength(3);
    expect(quotes[0]?.carrierId).toBe("ups");
  });

  it("normalises a single RatedShipment object into a one-item array", () => {
    const parsed = UpsRateResponseSchema.parse(singleResponse);
    const quotes = fromUpsRateResponse(parsed, "ups");

    expect(quotes).toHaveLength(1);
  });

  it("sets guaranteedDelivery true when GuaranteedDelivery field is present", () => {
    const parsed = UpsRateResponseSchema.parse(shopResponse);
    const quotes = fromUpsRateResponse(parsed, "ups");

    const ground = quotes.find((q) => q.serviceCode === "03");
    const nextDay = quotes.find((q) => q.serviceCode === "01");

    expect(ground?.guaranteedDelivery).toBe(false);
    expect(nextDay?.guaranteedDelivery).toBe(true);
  });

  it("maps monetary values to numbers and preserves currency", () => {
    const parsed = UpsRateResponseSchema.parse(singleResponse);
    const [quote] = fromUpsRateResponse(parsed, "ups");

    expect(quote?.totalCharge).toEqual({ amount: 12.34, currency: "USD" });
    expect(quote?.serviceOptionsCharge).toEqual({ amount: 0, currency: "USD" });
  });

  it("falls back to generated name for unknown service codes", () => {
    const unknown = {
      RateResponse: {
        Response: { ResponseStatus: { Code: "1", Description: "Success" } },
        RatedShipment: {
          Service: { Code: "99" },
          BillingWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "1.0" },
          TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "9.99" },
          ServiceOptionsCharges: { CurrencyCode: "USD", MonetaryValue: "0.00" },
          TotalCharges: { CurrencyCode: "USD", MonetaryValue: "9.99" },
        },
      },
    };
    const parsed = UpsRateResponseSchema.parse(unknown);
    const [quote] = fromUpsRateResponse(parsed, "ups");

    expect(quote?.serviceName).toBe("UPS Service 99");
  });
});
