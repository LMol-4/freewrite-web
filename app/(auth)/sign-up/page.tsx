"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = { status: "idle" };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  if (state.status === "sent") {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Check your email</h1>
          <p>We sent a confirmation link. Click it to finish creating your account.</p>
          <p className="auth-links"><Link scroll={false} href="/sign-in">Back to sign in</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>Sign up</h1>
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        {state.status === "error" && <p role="alert" className="auth-error">{state.message}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Signing up…" : "Sign up"}
        </button>
        <p className="auth-links">
          Already have an account? <Link scroll={false} href="/sign-in">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
