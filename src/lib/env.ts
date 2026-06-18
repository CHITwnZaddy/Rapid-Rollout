export function getRequiredEnv(
  env: Record<string, string | undefined>,
  key: string
): string {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
