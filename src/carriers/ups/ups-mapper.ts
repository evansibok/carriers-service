import { RateRequest, RateQuote, WeightUnit } from "../../types/domain";
import { UpsRateResponse } from "../../schemas/ups.schemas";
import {
  UPS_SERVICE_NAMES,
  UpsPackagingType,
  UpsShipmentChargeType,
  UPS_SUBVERSION,
} from "./ups-constants";

export function toUpsRateRequest(
  request: RateRequest,
  requestOption: "Shop" | "Rate",
) {
  const { origin, destination, packages, serviceCode, shipperAccountNumber } =
    request;

  const upsPackages = packages.map((pkg) => {
    const base: Record<string, unknown> = {
      PackagingType: { Code: UpsPackagingType.CUSTOMER_SUPPLIED },
      PackageWeight: {
        UnitOfMeasurement: { Code: pkg.weight.unit },
        Weight: String(pkg.weight.value),
      },
    };

    if (pkg.dimensions) {
      base["Dimensions"] = {
        UnitOfMeasurement: { Code: pkg.dimensions.unit },
        Length: String(pkg.dimensions.length),
        Width: String(pkg.dimensions.width),
        Height: String(pkg.dimensions.height),
      };
    }

    return base;
  });

  const shipment: Record<string, unknown> = {
    Shipper: {
      Address: {
        AddressLine: origin.addressLines,
        City: origin.city,
        StateProvinceCode: origin.stateCode,
        PostalCode: origin.postalCode,
        CountryCode: origin.countryCode,
      },
      ...(shipperAccountNumber ? { ShipperNumber: shipperAccountNumber } : {}),
    },
    ShipTo: {
      Address: {
        AddressLine: destination.addressLines,
        City: destination.city,
        StateProvinceCode: destination.stateCode,
        PostalCode: destination.postalCode,
        CountryCode: destination.countryCode,
        ...(destination.isResidential
          ? { ResidentialAddressIndicator: "" }
          : {}),
      },
    },
    ShipFrom: {
      Address: {
        AddressLine: origin.addressLines,
        City: origin.city,
        StateProvinceCode: origin.stateCode,
        PostalCode: origin.postalCode,
        CountryCode: origin.countryCode,
      },
    },
    PaymentDetails: {
      ShipmentCharge: {
        Type: UpsShipmentChargeType.TRANSPORTATION,
        BillShipper: shipperAccountNumber
          ? { AccountNumber: shipperAccountNumber }
          : {},
      },
    },
    Package: upsPackages,
  };

  if (requestOption === "Rate" && serviceCode) {
    shipment["Service"] = { Code: serviceCode };
  }

  return {
    RateRequest: {
      Request: {
        SubVersion: UPS_SUBVERSION,
        RequestOption: requestOption,
      },
      Shipment: shipment,
    },
  };
}

export function fromUpsRateResponse(
  response: UpsRateResponse,
  carrierId: string,
): RateQuote[] {
  return response.RateResponse.RatedShipment.map((shipment) => {
    const serviceCode = shipment.Service.Code;
    const serviceName =
      UPS_SERVICE_NAMES[serviceCode] ?? `UPS Service ${serviceCode}`;

    const weightUnit =
      (shipment.BillingWeight.UnitOfMeasurement.Code as WeightUnit) ?? "LBS";

    return {
      carrierId,
      serviceCode,
      serviceName,
      totalCharge: {
        amount: parseFloat(shipment.TotalCharges.MonetaryValue),
        currency: shipment.TotalCharges.CurrencyCode,
      },
      transportationCharge: {
        amount: parseFloat(shipment.TransportationCharges.MonetaryValue),
        currency: shipment.TransportationCharges.CurrencyCode,
      },
      serviceOptionsCharge: {
        amount: parseFloat(shipment.ServiceOptionsCharges.MonetaryValue),
        currency: shipment.ServiceOptionsCharges.CurrencyCode,
      },
      billingWeight: {
        value: parseFloat(shipment.BillingWeight.Weight),
        unit: weightUnit,
      },
      guaranteedDelivery: shipment.GuaranteedDelivery !== undefined,
    };
  });
}
