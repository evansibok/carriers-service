import { z } from "zod";

const ConfigSchema = z.object({
  UPS_CLIENT_ID: z.string().min(1),
  UPS_CLIENT_SECRET: z.string().min(1),
  UPS_ACCOUNT_NUMBER: z.string().length(6).optional(),
  UPS_SANDBOX: z.coerce.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuration error:\n${result.error.toString()}`);
  }
  return result.data;
}

export function getUpsBaseUrl(config: Config): string {
  return config.UPS_SANDBOX
    ? "https://wwwcie.ups.com"
    : "https://onlinetools.ups.com";
}
