"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Mail, Chrome, Building2, ArrowRight, Loader2 } from "lucide-react";

function SignInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Redirect authenticated users away from sign-in page
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading("credentials");
    await signIn("credentials", {
      email: email.trim(),
      name: name.trim() || undefined,
      callbackUrl,
    });
  };

  const handleOAuthLogin = async (provider: string) => {
    setIsLoading(provider);
    await signIn(provider, { callbackUrl });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060b16]">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-prism-sky/5 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-prism-accent/5 blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md px-4"
      >
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-prism-sky/20 to-prism-accent/20 border border-prism-sky/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-prism-sky" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            PRISM Intelligence
          </h1>
          <p className="text-sm text-prism-muted">
            Multi-agent strategic intelligence platform
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error === "OAuthSignin" && "Error starting OAuth sign in."}
            {error === "OAuthCallback" && "Error during OAuth callback."}
            {error === "OAuthAccountNotLinked" && "This email is already associated with another account."}
            {error === "CredentialsSignin" && "Invalid credentials."}
            {!["OAuthSignin", "OAuthCallback", "OAuthAccountNotLinked", "CredentialsSignin"].includes(error) && "An authentication error occurred."}
          </div>
        )}

        {/* Sign in card */}
        <div className="rounded-2xl border border-white/8 bg-[#0a0f1e]/80 backdrop-blur-xl p-6 space-y-5">
          {/* OAuth providers */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthLogin("google")}
              disabled={!!isLoading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {isLoading === "google" ? (
                <Loader2 className="w-5 h-5 animate-spin text-prism-muted" />
              ) : (
                <Chrome className="w-5 h-5 text-prism-muted" />
              )}
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuthLogin("microsoft-entra-id")}
              disabled={!!isLoading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {isLoading === "microsoft-entra-id" ? (
                <Loader2 className="w-5 h-5 animate-spin text-prism-muted" />
              ) : (
                <Building2 className="w-5 h-5 text-prism-muted" />
              )}
              Continue with Microsoft
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-[10px] font-mono text-prism-muted uppercase tracking-widest">
              or
            </span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Dev login (Credentials) */}
          <form onSubmit={handleCredentialsLogin} className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-prism-muted uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prism-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/10 text-sm text-white placeholder:text-prism-muted/50 focus:outline-none focus:border-prism-sky/30 focus:ring-1 focus:ring-prism-sky/20 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-prism-muted uppercase tracking-wider block mb-1.5">
                Name <span className="text-prism-muted/50">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2.5 rounded-xl bg-white/3 border border-white/10 text-sm text-white placeholder:text-prism-muted/50 focus:outline-none focus:border-prism-sky/30 focus:ring-1 focus:ring-prism-sky/20 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!email.trim() || !!isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-prism-sky/20 border border-prism-sky/20 text-prism-sky text-sm font-medium hover:bg-prism-sky/30 transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {isLoading === "credentials" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-prism-muted/50 mt-6">
          By signing in, you agree to the platform terms of use.
        </p>
      </motion.div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#060b16]">
          <Loader2 className="w-6 h-6 text-prism-muted animate-spin" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
