export function callbackPath(value: string | null) { return value === "/reset-password" ? value : "/"; }
export function appOrigin(requestOrigin?: string | null) {
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw Error("APP_ORIGIN must be configured");
  const origins = [configured, ...(process.env.APP_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)];
  for (const value of origins) {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw Error("Invalid application origin configuration");
  }
  if (requestOrigin && !origins.includes(requestOrigin)) throw Error("Untrusted application origin");
  return requestOrigin ?? configured;
}
export function emailInput(form: FormData) {
  const value = form.get("email");
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw Error("Enter a valid email address.");
  return value.trim();
}
export function passwordInput(form: FormData, minimum = 8) {
  const value = form.get("password");
  if (typeof value !== "string" || value.length < minimum || value.length > 1024) throw Error(`Password must contain at least ${minimum} characters and at most 1024.`);
  return value;
}
