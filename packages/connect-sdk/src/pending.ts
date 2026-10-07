/**
 * The one thing that survives redirect mode's navigation.
 *
 * When the browser refuses the popup too, the flow runs in this tab and the
 * page holding the launch is destroyed — listener, surface, callbacks and all.
 * A single `sessionStorage` record is written just before the assignment so
 * that `resume()`, on the page the flow returns to, can tell a launch that
 * actually went out from a `resume()` call sitting on an ordinary page.
 *
 * `sessionStorage` rather than `localStorage`: a launch in flight belongs to
 * one tab.
 *
 * Two limitations worth knowing, neither fixable from here:
 *
 * - A tab opened *by* this one receives a copy of this tab's session storage
 *   (the HTML standard's `legacy-clone a traversable storage shed`), so it can
 *   report the same outcome a second time. `window.name` is the only candidate
 *   not cloned, and the cross-origin navigation resets it.
 * - `sessionStorage` is partitioned by origin as well as by tab, so the
 *   destination page only finds the record if it is on the same origin as the
 *   page that launched. Carrying the outcome across an origin change would
 *   mean the app appending it to the destination URL.
 *
 * Every read and write is guarded, because a locked-down context can have
 * storage disabled entirely and even the getter throws there. A failure
 * degrades to redirect mode working without a resumable outcome. It never
 * prevents the navigation: completing the flow matters more than the callback.
 */

const STORAGE_KEY = "catena-connect.pending";

/**
 * The schema marker. A record without it is discarded rather than parsed, so
 * a future shape change is detected instead of misread.
 */
const SCHEMA = "catena-connect.pending/1";

/**
 * How long a recorded launch stays resumable.
 *
 * Long enough for a provider login, its MFA and any consent screens behind it;
 * short enough that someone who abandoned the flow and came back later gets
 * nothing. The app's own session is what actually gates the flow — this only
 * bounds the callback.
 */
const LIFETIME_MS = 30 * 60 * 1000;

interface PendingRecord {
  schema: string;
  id: string;
  /** Absolute, not a duration: a sleeping tab must not extend it. */
  expires: number;
}

/**
 * Record that a launch is going out, and return its identifier. `null` means
 * storage refused, which the caller ignores — it navigates either way.
 */
export function writePending(): string | null {
  const store = storage();
  if (store === null) return null;

  const id = newId();
  const record: PendingRecord = {
    schema: SCHEMA,
    id,
    expires: Date.now() + LIFETIME_MS,
  };

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Quota, private mode, or storage disabled. The launch goes ahead without
    // a resumable outcome.
    //
    // A refused `setItem` leaves whatever was under the key in place, so an
    // earlier launch's record has to come out before we give up — otherwise
    // the `resume()` after this navigation reports that stale record as this
    // launch's outcome. Silence is the documented degradation; a wrong answer
    // is not.
    remove(store);
    return null;
  }

  return id;
}

/**
 * Read the record and clear it, answering whether a live launch was found.
 *
 * Clearing happens whatever was found: an unreadable, unrecognized or expired
 * record is dead either way, and leaving one behind lets a later resume trip
 * over it.
 *
 * We report a launch only once the record is actually gone. If the clear
 * fails this answers `false` for a perfectly good record, because a second
 * resume (a reload of the destination page is enough) would otherwise deliver
 * the same outcome again. Losing a callback is a case the contract already
 * describes; double-counting a completed connection is not.
 */
export function takePending(): boolean {
  const store = storage();
  if (store === null) return false;

  const raw = read(store);
  if (raw === null) return false;

  if (!remove(store)) return false;

  const record = parse(raw);
  return record !== null && record.expires > Date.now();
}

/**
 * Clear the record this launch wrote, and only that one.
 *
 * Scoped by identifier because a navigation is not instant: the page keeps
 * running long enough to tear the first launch down and start a second, and an
 * unscoped clear running then would delete the second launch's record.
 */
export function clearPending(id: string): void {
  const store = storage();
  if (store === null) return;

  const raw = read(store);
  if (raw === null) return;
  if (parse(raw)?.id !== id) return;

  remove(store);
}

/**
 * `sessionStorage`, or `null` where reaching it throws. The property access is
 * inside the guard, not just the method call.
 */
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function read(store: Storage): string | null {
  try {
    return store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Whether the key is gone afterwards. The read path depends on the answer. */
function remove(store: Storage): boolean {
  try {
    store.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function parse(raw: string): PendingRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;

  // The marker is checked before any other field is trusted.
  const record = value as Partial<PendingRecord>;
  if (record.schema !== SCHEMA) return null;
  if (typeof record.id !== "string") return null;
  // Finite, not merely a number: `1e309` in the stored JSON parses as
  // `Infinity`, an expiry that never arrives. (`NaN` already reads as expired,
  // but this covers it rather than resting on which comparison we happen to
  // write.)
  const { expires } = record;
  if (typeof expires !== "number" || !Number.isFinite(expires)) return null;

  return { schema: SCHEMA, id: record.id, expires };
}

/**
 * Distinguish two records on one page from each other. Not a security token:
 * it is compared only against a value this same page wrote moments earlier,
 * and anything able to forge it can write the record directly.
 * `crypto.randomUUID` is unavailable outside a secure context, so using it
 * would add a fallback path for no benefit.
 */
function newId(): string {
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
}
