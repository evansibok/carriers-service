export type WeightUnit = "LBS" | "KGS";
export type DimensionUnit = "IN" | "CM";
export type CurrencyCode = string;

export interface Address {
  name?: string;
  addressLines: string[];
  city: string;
  stateCode: string;
  postalCode: string;
  countryCode: string;
  isResidential?: boolean;
}

export interface Package {
  weight: { value: number; unit: WeightUnit };
  dimensions?: { length: number; width: number; height: number; unit: DimensionUnit };
}

export interface RateRequest {
  origin: Address;
  destination: Address;
  packages: Package[];
  serviceCode?: string;
  shipperAccountNumber?: string;
}

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface RateQuote {
  carrierId: string;
  serviceCode: string;
  serviceName: string;
  totalCharge: Money;
  transportationCharge: Money;
  serviceOptionsCharge: Money;
  billingWeight: { value: number; unit: WeightUnit };
  guaranteedDelivery?: boolean;
}
