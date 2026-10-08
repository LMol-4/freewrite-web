import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { McpSetupError } from "./errors";

function encryptionKey() {
  const hex = process.env.MCP_KEY_ENCRYPTION_SECRET;
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) throw new McpSetupError("The MCP connector is not configured yet. Please contact the site owner.");
  return Buffer.from(hex, "hex");
}
export function generateKey() { return "fw_" + randomBytes(32).toString("base64url"); }
export function keyHash(key: string) { return createHash("sha256").update(key).digest("hex"); }
export function encryptKey(key: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function decryptKey(value: string, userId: string) {
  const [version, iv, tag, body, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body || extra) throw Error("Invalid encrypted key");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]).toString("utf8");
}
