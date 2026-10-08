"use client";

import { useActionState } from "react";

import { resetPassword } from "./actions";

export default function ResetPasswordPage() {
  const [error, formAction, pending] = useActionState(resetPassword, undefined);

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>set a new password</h1>
        <label>
          new password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        {error && <p role="alert" className="auth-error">{error.charAt(0).toLowerCase() + error.slice(1)}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "saving…" : "save password"}
        </button>
      </form>
    </div>
  );
}
