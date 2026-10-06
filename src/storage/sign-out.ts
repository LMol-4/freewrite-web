/** Data must survive every failed or cancelled sign-out. Cleanup is last. */
export async function safeSignOut(options: {
  hasUnsyncedWriting: () => Promise<boolean>;
  discard: boolean;
  signOut: () => Promise<{ error: { message: string } | null }>;
  cleanup: () => Promise<void>;
}): Promise<"confirmation-required" | "signed-out"> {
  if (await options.hasUnsyncedWriting() && !options.discard) return "confirmation-required";
  const { error } = await options.signOut();
  if (error) throw new Error(error.message);
  await options.cleanup();
  return "signed-out";
}
