"use server";

import { passwordInput } from "@/src/lib/auth/validation";
import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

export async function resetPassword(_prevState: string | undefined, formData: FormData) {
  const supabase = await createClient();

  let password: string;
  try { password = passwordInput(formData); } catch (error) { return error instanceof Error ? error.message : "Invalid password"; }
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user) return "Your reset session is missing or expired. Request a new link.";

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return error.message;
  }

  redirect("/");
}
