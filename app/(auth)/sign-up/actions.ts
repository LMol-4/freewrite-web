"use server";

import { appOrigin, emailInput, passwordInput } from "@/src/lib/auth/validation";
import { headers } from "next/headers";

import { createClient } from "@/src/lib/supabase/server";

export type SignUpState = { status: "idle" } | { status: "error"; message: string } | { status: "sent" };

export async function signUp(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  const supabase = await createClient();
  let origin: string, email: string, password: string;
  try { origin = appOrigin((await headers()).get("origin")); email = emailInput(formData); password = passwordInput(formData); }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Invalid input" }; }




  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "sent" };
}
