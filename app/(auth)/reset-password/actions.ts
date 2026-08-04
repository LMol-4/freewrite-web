"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

export async function resetPassword(_prevState: string | undefined, formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return error.message;
  }

  redirect("/");
}
