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
          <h1>check your email</h1>
          <p>we sent a link to reset your password.</p>
          <p className="auth-links"><Link scroll={false} href="/sign-in">back to sign in</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>forgot password</h1>
        <label>
          email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        {state.status === "error" && <p role="alert" className="auth-error">{state.message.charAt(0).toLowerCase() + state.message.slice(1)}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "sending…" : "send reset link"}
        </button>
        <p className="auth-links">
          <Link scroll={false} href="/sign-in">back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
