/** Compare actual instants, retaining Postgres sub-millisecond precision and the ID tie-breaker. */
export function newestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  const milliseconds = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (Number.isFinite(milliseconds) && milliseconds !== 0) return milliseconds;
  const fraction = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? "").slice(3, 9).padEnd(6, "0");
  return fraction(b.createdAt).localeCompare(fraction(a.createdAt)) || b.id.localeCompare(a.id);
}
