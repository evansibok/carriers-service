import { IHttpClient, HttpRequest, HttpResponse } from "../types/http";

export class FetchHttpClient implements IHttpClient {
  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = req.timeoutMs
      ? setTimeout(() => controller.abort(), req.timeoutMs)
      : null;

    let raw: Response;
    try {
      raw = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body:
          req.body !== undefined
            ? typeof req.body === "string"
              ? req.body
              : JSON.stringify(req.body)
            : undefined,
        signal: controller.signal,
      });
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }

    const headers: Record<string, string> = {};
    raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const text = await raw.text();
    let body: T;
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = text as unknown as T;
    }

    return { status: raw.status, headers, body };
  }
}
