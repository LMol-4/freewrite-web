"use server";

import { appOrigin, emailInput } from "@/src/lib/auth/validation";
import { headers } from "next/headers";

import { createClient } from "@/src/lib/supabase/server";

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent" };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const supabase = await createClient();
  let origin: string, email: string;
  try { origin = appOrigin((await headers()).get("origin")); email = emailInput(formData); }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Invalid input" }; }



  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "sent" };
}
