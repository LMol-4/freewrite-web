"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "./actions";

export default function SignInPage() {
  const [error, formAction, pending] = useActionState(signIn, undefined);

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>Sign in</h1>
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
        </p>
        <p className="auth-links">
          No account? <Link href="/sign-up">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
