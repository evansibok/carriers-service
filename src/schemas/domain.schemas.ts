import { z } from "zod";

const AddressSchema = z.object({
  name: z.string().optional(),
  addressLines: z.array(z.string().min(1)).min(1).max(3),
  city: z.string().min(1),
  stateCode: z.string().length(2),
  postalCode: z.string().min(1).max(9),
  countryCode: z.string().length(2),
  isResidential: z.boolean().optional(),
});

const PackageWeightSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["LBS", "KGS"]),
});

const PackageDimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["IN", "CM"]),
});

const PackageSchema = z.object({
  weight: PackageWeightSchema,
  dimensions: PackageDimensionsSchema.optional(),
});

export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1).max(200),
  serviceCode: z.string().optional(),
  shipperAccountNumber: z.string().length(6).optional(),
});

export type ValidatedRateRequest = z.infer<typeof RateRequestSchema>;
