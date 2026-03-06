"use client";

import { useState, useEffect, useCallback } from "react";

export interface OnboardingStatus {
  onboardingDismissed: boolean;
  hasCompletedTour: boolean;
  keys: { anthropic: boolean; openai: boolean };
}

export type WizardStep = "welcome" | "readiness" | "config" | "ready";

const STEPS: WizardStep[] = ["welcome", "readiness", "config", "ready"];

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>("welcome");

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => r.json())
      .then((data: OnboardingStatus) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const nextStep = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step]);

  const prevStep = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step]);

  const saveKey = useCallback(
    async (provider: string, key: string) => {
      await fetch("/api/onboarding/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data = await fetch("/api/onboarding/status").then((r) => r.json());
      setStatus(data);
    },
    []
  );

  const dismiss = useCallback(async () => {
    await fetch("/api/onboarding/dismiss", { method: "POST" });
    setStatus((s) => (s ? { ...s, onboardingDismissed: true } : s));
  }, []);

  const showWizard = !loading && status !== null && !status.onboardingDismissed;
  const stepIndex = STEPS.indexOf(step);

  return {
    status,
    loading,
    showWizard,
    step,
    stepIndex,
    totalSteps: STEPS.length,
    nextStep,
    prevStep,
    saveKey,
    dismiss,
  };
}
