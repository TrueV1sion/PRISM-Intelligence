import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

const ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  ncbi: "NCBI_API_KEY",
};

export async function resolveApiKey(
  provider: string
): Promise<string | null> {
  // Check DB first — keys saved via Platform Settings take priority
  try {
    const record = await prisma.apiKey.findUnique({
      where: { provider },
    });
    if (record) return decrypt(record.encryptedKey);
  } catch {
    // DB may not be available — fall through to env
  }

  // Fall back to environment variable
  const envVar = ENV_MAP[provider];
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue) return envValue;
  }

  return null;
}
