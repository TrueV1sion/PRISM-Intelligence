import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  const anthropicEnv = !!process.env.ANTHROPIC_API_KEY;
  const openaiEnv = !!process.env.OPENAI_API_KEY;

  let anthropicDb = false;
  let openaiDb = false;

  try {
    const keys = await prisma.apiKey.findMany();
    anthropicDb = keys.some((k) => k.provider === "anthropic");
    openaiDb = keys.some((k) => k.provider === "openai");
  } catch {
    // Table may not exist yet
  }

  return NextResponse.json({
    onboardingDismissed: settings?.onboardingDismissed ?? false,
    hasCompletedTour: settings?.hasCompletedTour ?? false,
    keys: {
      anthropic: anthropicEnv || anthropicDb,
      openai: openaiEnv || openaiDb,
    },
  });
}
