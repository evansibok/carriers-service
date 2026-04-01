import { IAuthProvider } from "../carriers/IAuthProvider";
import { IHttpClient } from "../types/http";
import { CarrierError, CarrierErrorCode } from "../types/errors";
import { UpsTokenResponseSchema } from "../schemas/ups.schemas";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export class UpsAuthProvider implements IAuthProvider {
  private cached: CachedToken | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly http: IHttpClient,
    private readonly tokenUrl: string,
  ) {}

  async getToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.accessToken;
    }
    return this.fetchToken();
  }

  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    let response;
    try {
      response = await this.http.request({
        url: this.tokenUrl,
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
    } catch (err) {
      throw new CarrierError(
        CarrierErrorCode.NETWORK_ERROR,
        "Failed to reach UPS auth endpoint",
        err,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new CarrierError(
        CarrierErrorCode.AUTH_FAILED,
        "UPS authentication failed — check client ID and secret",
        null,
        { statusCode: response.status },
      );
    }

    if (response.status === 429) {
      throw new CarrierError(
        CarrierErrorCode.RATE_LIMITED,
        "UPS auth endpoint rate limited",
        null,
        { statusCode: 429 },
      );
    }

    if (response.status >= 400) {
      throw new CarrierError(
        CarrierErrorCode.UPSTREAM_ERROR,
        `UPS auth endpoint returned ${response.status}`,
        null,
        { statusCode: response.status },
      );
    }

    const parsed = UpsTokenResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new CarrierError(
        CarrierErrorCode.INVALID_RESPONSE,
        "UPS auth response did not match expected shape",
        parsed.error,
      );
    }

    const { access_token, expires_in } = parsed.data;
    this.cached = {
      accessToken: access_token,
      expiresAt: Date.now() + parseInt(expires_in, 10) * 1000 - TOKEN_EXPIRY_BUFFER_MS,
    };

    return this.cached.accessToken;
  }
}
