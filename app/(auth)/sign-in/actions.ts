"use server";

import { emailInput, passwordInput } from "@/src/lib/auth/validation";
import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

export async function signIn(_prevState: string | undefined, formData: FormData) {
  const supabase = await createClient();

  let email: string, password: string;
  try { email = emailInput(formData); password = passwordInput(formData, 1); }
  catch (error) { return error instanceof Error ? error.message : "Invalid input"; }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return error.message;
  }

  redirect("/");
}
