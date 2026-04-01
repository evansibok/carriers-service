import { ICarrier } from "./ICarrier";
import { CarrierError, CarrierErrorCode } from "../types/errors";

export class CarrierRegistry {
  private readonly carriers = new Map<string, ICarrier>();

  register(carrier: ICarrier): void {
    this.carriers.set(carrier.carrierId, carrier);
  }

  get(carrierId: string): ICarrier {
    const carrier = this.carriers.get(carrierId);
    if (!carrier) {
      throw new CarrierError(
        CarrierErrorCode.CARRIER_NOT_FOUND,
        `Carrier "${carrierId}" is not registered`,
      );
    }
    return carrier;
  }

  getAll(): ICarrier[] {
    return Array.from(this.carriers.values());
  }
}
