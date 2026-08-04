"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle" };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "sent") {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Check your email</h1>
          <p>We sent a link to reset your password.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>Forgot password</h1>
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        {state.status === "error" && <p className="auth-error">{state.message}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
        <p className="auth-links">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
