import { ICarrier } from "../ICarrier";
import { IAuthProvider } from "../IAuthProvider";
import { IHttpClient, HttpResponse } from "../../types/http";
import { RateRequest, RateQuote } from "../../types/domain";
import { CarrierError, CarrierErrorCode } from "../../types/errors";
import { RateRequestSchema } from "../../schemas/domain.schemas";
import { UpsRateResponseSchema, UpsErrorResponseSchema } from "../../schemas/ups.schemas";
import { toUpsRateRequest, fromUpsRateResponse } from "./ups-mapper";

export class UpsCarrier implements ICarrier {
  readonly carrierId = "ups";

  constructor(
    private readonly auth: IAuthProvider,
    private readonly http: IHttpClient,
    private readonly baseUrl: string,
  ) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    const parsed = RateRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CarrierError(
        CarrierErrorCode.VALIDATION_ERROR,
        "Invalid rate request",
        parsed.error,
      );
    }

    const requestOption = parsed.data.serviceCode ? "Rate" : "Shop";
    const body = toUpsRateRequest(parsed.data, requestOption);

    const response = await this.callWithAuthRetry(requestOption, body, false);

    const validated = UpsRateResponseSchema.safeParse(response.body);
    if (!validated.success) {
      throw new CarrierError(
        CarrierErrorCode.INVALID_RESPONSE,
        "UPS rate response did not match expected shape",
        validated.error,
      );
    }

    return fromUpsRateResponse(validated.data, this.carrierId);
  }

  private async callWithAuthRetry(
    requestOption: "Shop" | "Rate",
    body: unknown,
    isRetry: boolean,
  ): Promise<HttpResponse> {
    let token: string;
    try {
      token = await this.auth.getToken();
    } catch (err) {
      throw err;
    }

    let response;
    try {
      response = await this.http.request({
        url: `${this.baseUrl}/api/rating/v2409/${requestOption}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          transId: "carrier-integration",
          transactionSrc: "carrier-integration",
        },
        body,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new CarrierError(CarrierErrorCode.TIMEOUT, "UPS rate request timed out", err);
      }
      throw new CarrierError(CarrierErrorCode.NETWORK_ERROR, "Failed to reach UPS rating endpoint", err);
    }

    if (response.status === 401) {
      if (isRetry) {
        throw new CarrierError(
          CarrierErrorCode.TOKEN_REFRESH_FAILED,
          "UPS rating endpoint returned 401 after token refresh",
        );
      }
      this.auth.invalidate();
      return this.callWithAuthRetry(requestOption, body, true);
    }

    if (response.status === 429) {
      throw new CarrierError(CarrierErrorCode.RATE_LIMITED, "UPS rating endpoint rate limited", null, {
        statusCode: 429,
      });
    }

    if (response.status >= 500) {
      throw new CarrierError(
        CarrierErrorCode.SERVER_ERROR,
        `UPS rating endpoint returned ${response.status}`,
        null,
        { statusCode: response.status },
      );
    }

    if (response.status >= 400) {
      const errParsed = UpsErrorResponseSchema.safeParse(response.body);
      const detail = errParsed.success
        ? errParsed.data.response.errors.map((e) => e.message).join("; ")
        : `status ${response.status}`;
      throw new CarrierError(
        CarrierErrorCode.UPSTREAM_ERROR,
        `UPS rating endpoint error: ${detail}`,
        null,
        { statusCode: response.status },
      );
    }

    return response;
  }
}
