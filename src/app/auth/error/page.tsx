"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration. Check your auth provider settings.",
    AccessDenied: "Access denied. You do not have permission to sign in.",
    Verification: "The verification token has expired or has already been used.",
    OAuthSignin: "Error constructing an authorization URL.",
    OAuthCallback: "Error handling the response from the OAuth provider.",
    OAuthCreateAccount: "Could not create a user account in the database.",
    EmailCreateAccount: "Could not create a user account with the email provider.",
    Callback: "Error in the OAuth callback handler.",
    OAuthAccountNotLinked: "This email is already associated with a different provider. Sign in with the original provider.",
    SessionRequired: "You must be signed in to access this page.",
  };

  const message = error ? errorMessages[error] ?? "An unexpected authentication error occurred." : "An unknown error occurred.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060b16]">
      <div className="max-w-md px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">
          Authentication Error
        </h1>
        <p className="text-sm text-prism-muted mb-6 leading-relaxed">
          {message}
        </p>
        {error && (
          <p className="text-[10px] font-mono text-prism-muted/50 mb-6">
            Error code: {error}
          </p>
        )}
        <Link
          href="/auth/signin"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-prism-sky/20 border border-prism-sky/20 text-prism-sky text-sm font-medium hover:bg-prism-sky/30 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#060b16]">
          <Loader2 className="w-6 h-6 text-prism-muted animate-spin" />
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
