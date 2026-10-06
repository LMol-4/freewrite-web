import { claimAccount, releaseAccount, renewAccount } from "./indexeddb";

/** Web Lock owns the tab; the IDB token fences every write and is also the fallback lease. */
export async function coordinateAccount(userId: string, onLost: () => void) {
  const owner = crypto.randomUUID();
  let releaseLock = () => {};
  let lockTask: Promise<unknown> | undefined;
  let allowed = true;
  if (navigator.locks) {
    allowed = await new Promise<boolean>((resolve, reject) => {
      lockTask = navigator.locks.request(`freewrite:${userId}`, { ifAvailable: true }, async lock => {
        resolve(!!lock);
        if (lock) await new Promise<void>(release => { releaseLock = release; });
      }).catch(reject);
    });
  }
  try {
    if (!allowed || !await claimAccount(userId, owner, Date.now(), !!navigator.locks)) { releaseLock(); return null; }
  } catch (error) { releaseLock(); await lockTask; throw error; }
  let ended = false;
  const interval = setInterval(() => {
    void renewAccount(userId, owner).then(ok => { if (!ok && !ended) onLost(); }).catch(() => { if (!ended) onLost(); });
  }, 4000);
  return { owner, async close() { ended = true; clearInterval(interval); try { await releaseAccount(userId, owner); } finally { releaseLock(); await lockTask; } } };
}
