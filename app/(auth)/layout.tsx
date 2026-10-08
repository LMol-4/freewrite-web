import Link from "next/link";
import { PublicPage } from "@/src/ui/components/PublicPage";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PublicPage>
    {children}
    <Link scroll={false} href="/" className="public-back">back to freewrite</Link>
  </PublicPage>;
}
