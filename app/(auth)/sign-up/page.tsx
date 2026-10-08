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
          <h1>check your email</h1>
          <p>we sent a confirmation link. Click it to finish creating your account.</p>
          <p className="auth-links"><Link scroll={false} href="/sign-in">back to sign in</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>sign up</h1>
        <label>
          email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        {state.status === "error" && <p role="alert" className="auth-error">{state.message.charAt(0).toLowerCase() + state.message.slice(1)}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "signing up…" : "sign up"}
        </button>
        <p className="auth-links">
          already have an account? <Link scroll={false} href="/sign-in">sign in</Link>
        </p>
      </form>
    </div>
  );
}
