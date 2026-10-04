/**
 * Retains an owner across React's synchronous development cleanup/setup replay.
 * @param owner - View-owned resource identity.
 * @param close - Explicit final owner cleanup.
 * @param leases - View-local WeakMap retained in a React ref.
 * @returns Cleanup that closes after the current microtask unless setup renewed it.
 * @remarks Native observer cleanup remains immediate in the hook's cleanup. This
 * edge delays only retirement of the reusable domain state owner.
 */
export function borrowViewOwner(
  owner: object,
  close: () => void,
  leases: WeakMap<object, object>,
): () => void {
  const lease = {};
  leases.set(owner, lease);
  return () =>
    queueMicrotask(() => {
      if (leases.get(owner) !== lease) return;
      leases.delete(owner);
      close();
    });
}
