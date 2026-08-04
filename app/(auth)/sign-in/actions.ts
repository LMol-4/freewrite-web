"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

export async function signIn(_prevState: string | undefined, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return error.message;
  }

  redirect("/");
}
