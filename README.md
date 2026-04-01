# Carrier Integration Service

A TypeScript library that wraps the UPS Rating API with OAuth 2.0 authentication, normalised domain types, structured error handling, and an extensible carrier architecture. Tested entirely through injected HTTP stubs — no live API calls required.

---

## Getting started

**Requires Node 22.** If you use nvm:

```bash
nvm install 22
nvm use 22
```

```bash
cp .env.example .env
# fill in UPS_CLIENT_ID and UPS_CLIENT_SECRET
npm install
npm run build   # tsc --noEmit — must pass with zero errors
npm test        # vitest run — all tests green
```

### Environment variables

| Variable             | Required | Default | Description                                      |
| -------------------- | -------- | ------- | ------------------------------------------------ |
| `UPS_CLIENT_ID`      | Yes      | —       | OAuth client ID from UPS Developer Portal        |
| `UPS_CLIENT_SECRET`  | Yes      | —       | OAuth client secret                              |
| `UPS_ACCOUNT_NUMBER` | No       | —       | 6-digit UPS account number for negotiated rates  |
| `UPS_SANDBOX`        | No       | `true`  | `true` = sandbox (`wwwcie.ups.com`), `false` = production (`onlinetools.ups.com`) |

### Usage

```typescript
import { loadConfig, getUpsBaseUrl, UpsAuthProvider, UpsCarrier, FetchHttpClient, CarrierRegistry } from "./src";

const config = loadConfig();
const http = new FetchHttpClient();
const auth = new UpsAuthProvider(
  config.UPS_CLIENT_ID,
  config.UPS_CLIENT_SECRET,
  http,
  `${getUpsBaseUrl(config)}/security/v1/oauth/token`,
);

const ups = new UpsCarrier(auth, http, getUpsBaseUrl(config));

const registry = new CarrierRegistry();
registry.register(ups);

const quotes = await registry.get("ups").getRates({
  origin: {
    addressLines: ["123 Main St"],
    city: "Atlanta",
    stateCode: "GA",
    postalCode: "30301",
    countryCode: "US",
  },
  destination: {
    addressLines: ["456 Oak Ave"],
    city: "Los Angeles",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US",
  },
  packages: [{ weight: { value: 5, unit: "LBS" } }],
});
```

Omit `serviceCode` to shop all available services (`Shop` mode). Provide one to rate a specific service (`Rate` mode).

---

## Architecture

### Dependency injection over mocking

Every component that touches the network accepts an `IHttpClient` interface:

```typescript
interface IHttpClient {
  request<T>(req: HttpRequest): Promise<HttpResponse<T>>;
}
```

`FetchHttpClient` is the production implementation. Tests supply a `StubHttpClient` — the test double queues pre-configured responses per route (method + URL) and consumes them in order. This design means the full carrier stack — auth token acquisition, rate request, response parsing — is exercised in tests without mock libraries, monkey-patching, or live network access. Critically, a single test can push a 401 followed by a 200 onto the same route to verify the auth retry path end-to-end in sequence.

### Layer separation

```
IHttpClient (interface)
    ↓
UpsAuthProvider          — token acquire, cache, invalidate
    ↓
UpsCarrier               — orchestrates auth + HTTP + validation + mapping
    ├── ups-mapper.ts    — pure functions: domain → UPS wire format, UPS wire format → domain
    └── ups-constants.ts — service code lookup table
```

Each layer has a single responsibility. The mapper functions are pure — no class, no state, no side effects. They take data in and return data out, which makes them independently testable with raw fixtures and easy to reason about when the UPS wire format changes.

### Module format — CommonJS over ESM

`tsconfig.json` targets `"module": "CommonJS"` rather than NodeNext/ESM. The reason is practical: NodeNext ESM requires every import path to include a `.js` extension even when the source file is `.ts`. This is a well-known footgun that causes confusing compiler errors and breaks many editors' go-to-definition. Since this is a backend-only library with no bundler and no browser target, CommonJS gives identical runtime behaviour with none of that friction.

### Token caching

`UpsAuthProvider` caches the bearer token and applies a 60-second expiry buffer so tokens are never used in the final minute of their TTL. On a 401 from the rating endpoint, `UpsCarrier` calls `auth.invalidate()` and retries once. A second consecutive 401 throws `TOKEN_REFRESH_FAILED` rather than looping.

### Validation boundaries

Zod schemas are applied at exactly two points:

1. **Input** — `RateRequestSchema` validates the caller's `RateRequest` before any HTTP call is made. Invalid input throws `VALIDATION_ERROR` immediately.
2. **Output** — `UpsRateResponseSchema` validates the raw UPS response before mapping. A response that doesn't match the expected shape throws `INVALID_RESPONSE`.

Nothing in between is validated. Applying Zod throughout internal layers adds schema maintenance overhead without meaningful safety gain — once data has passed a boundary check, TypeScript's type system carries it from there. This also keeps the mapper functions free of runtime validation logic, which would mix two concerns in one place.

### `noUncheckedIndexedAccess`

`tsconfig.json` enables `noUncheckedIndexedAccess`. Without it, `UPS_SERVICE_NAMES[code]` has type `string`, so the unknown-service-code fallback path is invisible to the compiler. With the flag, it has type `string | undefined`, and TypeScript enforces that the `?? "UPS Service ${code}"` fallback is present. It's a non-default strictness flag that earns its keep here.

### Error taxonomy

All errors are instances of `CarrierError` with a typed `code` field:

| Code                   | Meaning                                          |
| ---------------------- | ------------------------------------------------ |
| `VALIDATION_ERROR`     | Caller supplied an invalid `RateRequest`         |
| `INVALID_RESPONSE`     | UPS response failed schema validation            |
| `AUTH_FAILED`          | 401/403 from the token endpoint                  |
| `TOKEN_REFRESH_FAILED` | 401 from rating endpoint even after token refresh |
| `NETWORK_ERROR`        | `fetch()` threw (DNS failure, ECONNREFUSED)      |
| `TIMEOUT`              | Request exceeded `timeoutMs` via `AbortController` |
| `RATE_LIMITED`         | 429 from any UPS endpoint                        |
| `UPSTREAM_ERROR`       | Other 4xx from UPS                               |
| `SERVER_ERROR`         | 5xx from UPS                                     |
| `CARRIER_NOT_FOUND`    | `registry.get()` called with an unregistered id  |
| `NOT_IMPLEMENTED`      | Carrier stub not yet implemented (FedEx)         |

### Extensibility

Adding a new carrier means implementing two interfaces:

```typescript
interface ICarrier {
  readonly carrierId: string;
  getRates(request: RateRequest): Promise<RateQuote[]>;
}

interface IAuthProvider {
  getToken(): Promise<string>;
  invalidate(): void;
}
```

`FedExCarrier` is included as a stub to demonstrate this — it satisfies `ICarrier`, registers in the same `CarrierRegistry`, and throws `NOT_IMPLEMENTED`. Replacing the stub with a real implementation requires zero changes to UPS code or the registry.

---

## Testing approach

Tests live in `tests/` and are driven by Vitest. Each test file wires up real class instances — `UpsAuthProvider`, `UpsCarrier`, `CarrierRegistry` — against a `StubHttpClient` rather than testing functions in isolation. This exercises the full request lifecycle (validation → auth → HTTP → response parsing → domain mapping) in every test.

```
tests/
├── helpers/stub-http-client.ts   # IHttpClient test double
├── fixtures/                     # realistic UPS JSON payloads
├── ups-mapper.test.ts            # request building + response parsing
├── ups-auth.test.ts              # token lifecycle: acquire, cache, invalidate, errors
├── ups-carrier.test.ts           # end-to-end: happy path, auth retry, all error codes
└── carrier-registry.test.ts      # register, get, getAll, overwrite
```

Run them:

```bash
npm test
```

---

## What I would improve given more time

### Retry resilience

The 401 auth retry is implemented, but transient 5xx errors from UPS are not retried. A production implementation would inject a retry policy — configurable max attempts, base delay, and jitter — at the `IHttpClient` level so all carriers benefit automatically without changes to carrier code.

### FedEx implementation

`FedExCarrier` is a stub. Implementing it would follow the identical pattern: a `FedExAuthProvider` using FedEx's OAuth flow, a `FedExMapper` for their rate request/response format, and a `FedExCarrier` wiring them together. The `ICarrier` contract and `CarrierRegistry` require no changes.

### Additional carrier operations

Only `getRates` is implemented on `ICarrier`. `purchaseLabel` and `trackShipment` would follow the same pattern — auth provider, mapper, carrier method — and slot into the existing interface cleanly.

### Richer error metadata

`CarrierError` carries a `meta` field but it's lightly populated. A `retryAfter` value parsed from 429 response headers, and structured UPS error codes passed through in `meta.upsCodes`, would give callers enough information to handle errors programmatically without parsing message strings.

### Negotiated rates verification

When `shipperAccountNumber` is provided the request is built to use negotiated rates, but this path has no end-to-end fixture coverage. A fixture pair (request + response with `NegotiatedRateCharges`) would close that gap.

### Schema coverage

The `UpsRatedShipment` schema captures the fields needed for `RateQuote` but UPS returns many more (surcharges, accessorials, zone, rated package details). Expanding the schema and surfacing those fields in `RateQuote` would make the service useful for a wider range of billing and audit use cases.
