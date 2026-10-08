"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "./actions";

export default function SignInPage() {
  const [error, formAction, pending] = useActionState(signIn, undefined);

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>sign in</h1>
        <label>
          email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="auth-error">{error.charAt(0).toLowerCase() + error.slice(1)}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "signing in…" : "sign in"}
        </button>
        <p className="auth-links">
          <Link scroll={false} href="/forgot-password">forgot password?</Link>
        </p>
        <p className="auth-links">
          no account? <Link scroll={false} href="/sign-up">sign up</Link>
        </p>
      </form>
    </div>
  );
}
