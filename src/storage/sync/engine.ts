import { cachedRemoteBody, type Journal } from "./journal";
import { RemoteError, type RemoteStore } from "./types";

export interface SyncEvents {
  active(): boolean;
  selected(): string | undefined;
  changed(): Promise<void>;
  quiesce(): Promise<void>;
  resume(): void;
  status(value: string): void;
  notice(value: string): void;
}
/** One drain per account coordinator; every network boundary is followed by session/fence checks. */
export class EntrySync {
  private running: Promise<void> | null = null;
  private queued: { reconcile: boolean; force: boolean } | null = null;
  private idle?: ReturnType<typeof setTimeout>;
  private maximum?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDeadline = Infinity;
  private stopped = false;
  private schedulingPaused = false;
  private authPaused = false;
  private recoveryNotice = false;
  constructor(private journal: Journal, private remote: RemoteStore, private events: SyncEvents,
    private now = Date.now, private random = Math.random) {}
  private check() { if (this.stopped || !this.events.active()) throw new RemoteError("Session changed. Sign in again to sync.", "auth"); }
  schedule() {
    if (this.stopped || this.authPaused || this.schedulingPaused) return;
    this.events.status("Saved on this device · Pending sync");
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.background(), 2000);
    this.maximum ??= setTimeout(() => this.background(), 15000);
  }
  private background() { if (!this.schedulingPaused) void this.flush().catch(() => {}); }
  stop() { this.stopped = true; this.cancelTimers(); clearTimeout(this.retryTimer); }
  pauseScheduling() { this.schedulingPaused = true; this.cancelTimers(); clearTimeout(this.retryTimer); this.retryDeadline = Infinity; }
  resumeScheduling() { this.schedulingPaused = false; this.retry(1000); }
  async settled() { await this.running?.catch(() => {}); }
  private cancelTimers() { clearTimeout(this.idle); clearTimeout(this.maximum); this.idle = undefined; this.maximum = undefined; }
  async flush(reconcile = false, force = false): Promise<void> {
    this.cancelTimers();
    if (force) this.authPaused = false;
    if (this.authPaused) throw new RemoteError("Sign in again to sync. Local writing is retained.", "auth");
    if (this.running) {
      // Focus, visibility and explicit saves can arrive together. Share one
      // trailing pass, including changes made while the current pass is busy.
      this.queued = { reconcile: reconcile || !!this.queued?.reconcile, force: force || !!this.queued?.force };
      return this.running;
    }
    let failed = false;
    this.running = (async () => {
      let next: { reconcile: boolean; force: boolean } | null = { reconcile, force };
      while (next) {
        this.queued = null;
        await this.drain(next.reconcile, next.force);
        next = this.queued;
      }
    })().catch(error => {
      failed = true;
      if (!this.stopped && this.events.active()) {
        this.authPaused = error instanceof RemoteError && error.kind === "auth";
        this.events.status(this.authPaused ? "Sign in again to sync. Local writing is retained." :
          typeof navigator !== "undefined" && !navigator.onLine ? "Offline · Saved on this device" : `Sync error: ${error instanceof Error ? error.message : "Retry sync"}`);
        if (!this.authPaused && (!(error instanceof RemoteError) || error.kind === "retry")) this.retry(30000);
      }
      throw error;
    }).finally(() => {
      this.running = null;
      const queued = this.queued;
      this.queued = null;
      // Cover requests arriving between the loop's completion and cleanup.
      if (queued && !failed && !this.stopped) return this.flush(queued.reconcile, queued.force);
    });
    return this.running;
  }
  private retry(delay: number) {
    const deadline = this.now() + delay;
    if (this.stopped || this.schedulingPaused || deadline >= this.retryDeadline) return;
    clearTimeout(this.retryTimer); this.retryDeadline = deadline;
    this.retryTimer = setTimeout(() => { this.retryDeadline = Infinity; this.background(); }, Math.max(50, delay));
  }
  private async reconcile() {
    let cursor: { createdAt: string; id: string } | undefined;
    const seen = new Set<string>();
    do {
      this.check(); const page = await this.remote.list(cursor); this.check();
      for (const row of page.rows) {
        if (seen.has(row.id)) continue; seen.add(row.id);
        const local = await this.journal.get(row.id);
        // Dirty base versions never advance on focus/listing.
        if (local?.dirty) continue;
        if (local?.baseServerVersion === row.version && (local.body !== null || this.events.selected() !== row.id)) continue;
        let body = cachedRemoteBody(local, row);
        if (!row.deleted_at && this.events.selected() === row.id && body === null) {
          body = await this.remote.body(row);
        }
        this.check(); await this.journal.adopt(row, body, local?.localGeneration);
      }
      if (page.next && cursor && page.next.id === cursor.id && page.next.createdAt === cursor.createdAt) throw Error("Metadata pagination did not advance. Local writing retained.");
      cursor = page.next;
    } while (cursor);
    // Missing from this traversal never means deleted. Local-only clean rows are investigated.
    for (const entry of await this.journal.entries()) if (!entry.dirty && !seen.has(entry.id) && !entry.deleted) {
      this.check(); const row = await this.remote.get(entry.id); this.check();
      if (row) {
        const body = row.deleted_at ? null : this.events.selected() === entry.id ? await this.remote.body(row) : null;
        this.check(); await this.journal.adopt(row, body, entry.localGeneration);
      }
    }
    await this.events.changed();
  }
  private async drain(reconcile: boolean, force: boolean) {
    this.check(); this.events.status("Syncing…");
    let firstError: unknown;
    if (reconcile) try { await this.reconcile(); } catch (error) { if (error instanceof RemoteError && error.kind === "auth") throw error; firstError = error; }
    const failed = new Set<string>();
    // Bounded foreground work; successors continue in another scheduled drain.
    for (let round = 0; round < 8; round++) {
      this.check();
      const entries = await this.journal.entries();
      let work = false;
      for (const entry of entries) {
        if (failed.has(entry.id)) continue;
        this.check(); const m = await this.journal.freeze(entry); if (!m) continue;
        if (!force && m.retryAt > this.now()) {
          if (m.retryAt < Number.MAX_SAFE_INTEGER) this.retry(m.retryAt - this.now());
          if (m.failure) firstError ??= new RemoteError(m.failure.message, m.failure.kind);
          failed.add(entry.id); continue;
        }
        work = true;
        try {
          this.check(); const result = await this.remote.publish(m); this.check();
          if (result.status === "ok" && result.entry) {
            await this.journal.acknowledge(m, result.entry);
            if (m.request.recovered) this.recoveryNotice = true;
            // A replayed older receipt is not the current canonical row.
            const canonical = await this.remote.get(entry.id); this.check();
            if (canonical && canonical.version > result.entry.version) {
              const local = await this.journal.get(entry.id);
              if (local && !local.dirty) {
                const body = canonical.deleted_at ? null : this.events.selected() === entry.id ? await this.remote.body(canonical) : null;
                this.check(); await this.journal.adopt(canonical, body, local.localGeneration);
              }
            }
          } else {
            await this.events.quiesce();
            try {
              this.check(); const canonical = await this.remote.get(entry.id); this.check();
              const body = canonical && !canonical.deleted_at ? await this.remote.body(canonical) : null;
              this.check(); await this.journal.recover(m, canonical, body);
              if (m.request.operation === "delete") this.events.notice("This entry changed on another device. Review it before deleting again.");
              await this.events.changed();
            } finally { this.events.resume(); }
          }
          this.check(); await this.events.changed();
        } catch (error) {
          firstError ??= error; failed.add(entry.id);
          if (error instanceof RemoteError && error.kind === "auth") throw error;
          const delay = Math.max(error instanceof RemoteError ? error.retryAfter : 0, Math.min(30000, 1000 * 2 ** Math.min(m.attempts, 5)) * (0.8 + this.random() * 0.2));
          const retryable = !(error instanceof RemoteError) || error.kind === "retry";
          this.check(); await this.journal.retry(m, retryable ? this.now() + delay : Number.MAX_SAFE_INTEGER,
            { message: error instanceof Error ? error.message : "Cloud sync failed", kind: error instanceof RemoteError ? error.kind : "retry" });
          if (retryable) this.retry(delay);
        }
      }
      if (!work) break;
    }
    for (const task of await this.journal.cleanups()) {
      try { this.check(); await this.remote.cleanup(task); this.check(); await this.journal.cleaned(task); }
      catch (error) { firstError ??= error; }
    }
    if (this.recoveryNotice) { this.events.notice("This entry changed on another device. Your version was saved separately."); this.recoveryNotice = false; }
    if (firstError) throw firstError;
    this.check();
    if (await this.journal.hasPending()) { this.events.status("Saved on this device · Pending sync"); if (!failed.size) this.retry(1000); }
    else this.events.status("Entries synced");
  }
}
