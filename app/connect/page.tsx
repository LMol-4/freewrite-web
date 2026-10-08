import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { appOrigin } from "@/src/lib/auth/validation";
import { McpConnector } from "@/src/ui/components/McpConnector";
export const dynamic = "force-dynamic";
export default async function ConnectPage() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/sign-in");
  return <McpConnector userId={data.user.id} origin={appOrigin()} />;
}
