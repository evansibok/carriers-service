import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const UpsTokenResponseSchema = z.object({
  token_type: z.literal("Bearer"),
  issued_at: z.string(),
  access_token: z.string(),
  expires_in: z.string(), // UPS returns this as a string e.g. "14399"
  client_id: z.string(),
  scope: z.string().optional(),
  status: z.string().optional(),
  refresh_count: z.string().optional(),
});

export type UpsTokenResponse = z.infer<typeof UpsTokenResponseSchema>;

// ── Rate API ──────────────────────────────────────────────────────────────────

const UpsMoneySchema = z.object({
  CurrencyCode: z.string(),
  MonetaryValue: z.string(),
});

const UpsUomSchema = z.object({
  Code: z.string(),
  Description: z.string().optional(),
});

export const UpsRatedShipmentSchema = z.object({
  Service: z.object({
    Code: z.string(),
    Description: z.string().optional(),
  }),
  BillingWeight: z.object({
    UnitOfMeasurement: UpsUomSchema,
    Weight: z.string(),
  }),
  TransportationCharges: UpsMoneySchema,
  ServiceOptionsCharges: UpsMoneySchema,
  TotalCharges: UpsMoneySchema,
  TimeInTransit: z
    .object({
      ServiceSummary: z
        .object({
          Guaranteed: z.object({ Code: z.string() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const UpsRateResponseSchema = z.object({
  RateResponse: z.object({
    Response: z.object({
      ResponseStatus: z.object({
        Code: z.string(),
        Description: z.string(),
      }),
    }),
    RatedShipment: z.array(UpsRatedShipmentSchema),
  }),
});

export type UpsRateResponse = z.infer<typeof UpsRateResponseSchema>;

// ── Error response ────────────────────────────────────────────────────────────

export const UpsErrorResponseSchema = z.object({
  response: z.object({
    errors: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
      }),
    ),
  }),
});
