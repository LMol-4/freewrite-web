import Link from "next/link";
import { PublicPage } from "@/src/ui/components/PublicPage";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PublicPage>
    <Link scroll={false} href="/" className="public-brand">hi, this is freewrite.</Link>
    {children}
    <Link scroll={false} href="/" className="public-back">back to freewrite</Link>
  </PublicPage>;
}
