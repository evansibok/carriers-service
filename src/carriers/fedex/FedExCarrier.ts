import { ICarrier } from "../ICarrier";
import { RateRequest, RateQuote } from "../../types/domain";
import { CarrierError, CarrierErrorCode } from "../../types/errors";

export class FedExCarrier implements ICarrier {
  readonly carrierId = "fedex";

  async getRates(_request: RateRequest): Promise<RateQuote[]> {
    throw new CarrierError(CarrierErrorCode.NOT_IMPLEMENTED, "FedEx carrier is not yet implemented");
  }
}
