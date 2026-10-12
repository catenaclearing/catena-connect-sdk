/**
 * A short random tail for names that only need to be distinct: the pending
 * record's id and the flow window's name. Neither is a secret.
 *
 * From `crypto.getRandomValues` rather than `Math.random` all the same, so a
 * security scanner reading the bundle has nothing to flag. Unlike
 * `crypto.randomUUID`, it is available outside a secure context too.
 */
export function randomTail(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}
