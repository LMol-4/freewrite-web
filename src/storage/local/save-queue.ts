/** Serial immediate writes. Only a not-yet-started snapshot may be coalesced. */
export class LocalSaveQueue {
  private pending: { body: string; generation: number } | null = null;
  private running: Promise<void> | null = null;
  private requested = 0;
  private failed: unknown;
  constructor(private save: (body: string) => Promise<void>, private report: (state: "saving" | "saved" | "error", error?: unknown) => void) {}
  request(body: string) {
    this.pending = { body, generation: ++this.requested };
    this.failed = undefined;
    this.report("saving");
    this.start();
  }
  private start() {
    if (this.running) return;
    this.running = this.drain().finally(() => { this.running = null; });
  }
  private async drain() {
    while (this.pending) {
      const snapshot = this.pending;
      this.pending = null;
      try { await this.save(snapshot.body); }
      catch (error) { this.pending ??= snapshot; this.failed = error; this.report("error", error); return; }
      if (snapshot.generation === this.requested) this.report("saved");
    }
  }
  async flush() {
    if (this.running) await this.running;
    if (this.pending) { this.failed = undefined; this.start(); await this.running; }
    if (this.failed) throw this.failed;
  }
  get unsaved() { return !!this.pending || !!this.running; }
}
