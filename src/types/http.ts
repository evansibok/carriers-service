export interface HttpRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export interface IHttpClient {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}
