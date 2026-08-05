/**
 * Extracts a stable string id from a Mongoose reference, regardless of
 * whether the ref is a populated document or a raw ObjectId.
 *
 * Root cause this fixes: repository read methods populate refs (assignee,
 * author, owner, members) for display, but create() and some queries leave
 * them as raw ObjectIds. A POPULATED document's `.toString()` returns
 * util.inspect output — NOT the id — so `ref?.toString()` silently produced
 * garbage that failed ObjectId casts (comment/status/deadline notifications
 * never persisted). The old workaround (`ref?._id?.toString() ?? ref?.toString()`)
 * was copy-pasted to 14 call sites.
 *
 * This helper is the single seam that knows both shapes: prefer `_id`, fall
 * back to the ref's own toString (raw ObjectId / plain string id).
 */
export function refId(ref: unknown): string | null {
  if (ref == null) return null;

  // Populated document → has `_id`; raw ObjectId → `_id` is undefined.
  const candidate = ref as { _id?: unknown } | null;
  const id = candidate?._id;

  if (id != null) {
    return typeof id === 'string'
      ? id
      : (id as { toString(): string }).toString();
  }

  return typeof ref === 'string'
    ? ref
    : (ref as { toString(): string }).toString();
}
