"use client";

import { useState } from "react";
import { Github } from "@/components/github-icon";
import { Button } from "@/components/ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function GitHubSignInButton({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", nextPath.startsWith("/") ? nextPath : "/dashboard");

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: callback.toString(),
          scopes: "read:user user:email",
        },
      });
      if (authError) throw authError;
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Sign-in could not be started.");
      setPending(false);
    }
  }

  return (
    <>
      <Button className="github-button" disabled={pending} onClick={signIn} size="large" variant="secondary">
        <Github size={19} /> {pending ? "Opening GitHub…" : "Continue with GitHub"}
      </Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </>
  );
}
