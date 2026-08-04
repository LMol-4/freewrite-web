"use server";

import { headers } from "next/headers";

import { createClient } from "@/src/lib/supabase/server";

export type SignUpState = { status: "idle" } | { status: "error"; message: string } | { status: "sent" };

export async function signUp(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

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
