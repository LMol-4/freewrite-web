import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export default async function ContinuePage() {
  const { data, error } = await (await createClient()).auth.getUser();
  if (error?.name === "AuthRetryableFetchError" || (error?.status ?? 0) >= 500) redirect("/");
  redirect(data.user ? "/" : "/sign-in");
}
