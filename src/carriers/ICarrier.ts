import { RateRequest, RateQuote } from "../types/domain";

export interface ICarrier {
  readonly carrierId: string;
  getRates(request: RateRequest): Promise<RateQuote[]>;
}
