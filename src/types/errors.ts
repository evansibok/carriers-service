export enum CarrierErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  AUTH_FAILED = "AUTH_FAILED",
  TOKEN_REFRESH_FAILED = "TOKEN_REFRESH_FAILED",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  RATE_LIMITED = "RATE_LIMITED",
  UPSTREAM_ERROR = "UPSTREAM_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  CARRIER_NOT_FOUND = "CARRIER_NOT_FOUND",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
}


export class CarrierError extends Error {
  constructor(
    public readonly code: CarrierErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CarrierError";
  }
}
