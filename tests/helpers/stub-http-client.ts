import { IHttpClient, HttpRequest, HttpResponse } from "../../src/types/http";

type QueueEntry =
  | { type: "response"; value: HttpResponse }
  | { type: "error"; value: unknown };

export class StubHttpClient implements IHttpClient {
  public calls: HttpRequest[] = [];
  private queues = new Map<string, QueueEntry[]>();

  private key(method: string, url: string): string {
    return `${method.toUpperCase()} ${url}`;
  }

  on(method: string, url: string, response: HttpResponse): this {
    const k = this.key(method, url);
    if (!this.queues.has(k)) this.queues.set(k, []);
    this.queues.get(k)!.push({ type: "response", value: response });
    return this;
  }

  onError(method: string, url: string, error: unknown): this {
    const k = this.key(method, url);
    if (!this.queues.has(k)) this.queues.set(k, []);
    this.queues.get(k)!.push({ type: "error", value: error });
    return this;
  }

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    this.calls.push(req);
    const k = this.key(req.method, req.url);
    const queue = this.queues.get(k);
    const entry = queue?.shift();

    if (!entry) {
      throw new Error(`StubHttpClient: no response queued for ${k}`);
    }

    if (entry.type === "error") {
      throw entry.value;
    }

    return entry.value as HttpResponse<T>;
  }
}
