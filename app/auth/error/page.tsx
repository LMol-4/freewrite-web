import Link from "next/link";
export default function AuthError() {
  return <main className="auth-page"><div><h1>this link could not be used</h1><p>it may have expired or already been used. Open the new link in the browser where you requested it.</p><Link href="/sign-up">request a new confirmation</Link><p><Link href="/forgot-password">request a password reset</Link></p><Link href="/sign-in">sign in</Link></div></main>;
}
