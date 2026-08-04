"use client";

import { useActionState } from "react";

import { resetPassword } from "./actions";

export default function ResetPasswordPage() {
  const [error, formAction, pending] = useActionState(resetPassword, undefined);

  return (
    <div className="auth-page">
      <form action={formAction} className="auth-form">
        <h1>Set a new password</h1>
        <label>
          New password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
