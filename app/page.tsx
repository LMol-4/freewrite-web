import { pickPlaceholder } from "@/src/core/placeholders";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { Writer } from "@/src/ui/components/Writer";
export default async function Home() {
  const { data, error } = await (await createClient()).auth.getUser();
  if (error?.name === "AuthRetryableFetchError" || (error?.status ?? 0) >= 500) {
    return <main className="auth-page"><div><h1>Cannot check your session</h1><p>Your local writing has been retained. Check your connection and retry.</p><form action="/" method="get"><button type="submit">Retry</button></form></div></main>;
  }
  if (error || !data.user) redirect("/sign-in");
  return <Writer key={data.user.id} userId={data.user.id} initialPlaceholder={pickPlaceholder()} />;
}
