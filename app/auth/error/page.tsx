import Link from "next/link";
export default function AuthError() {
  return <main className="auth-page"><div><h1>This link could not be used</h1><p>It may have expired or already been used. Open the new link in the browser where you requested it.</p><Link href="/sign-up">Request a new confirmation</Link><p><Link href="/forgot-password">Request a password reset</Link></p><Link href="/sign-in">Sign in</Link></div></main>;
}
