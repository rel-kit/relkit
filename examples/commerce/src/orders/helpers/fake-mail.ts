const sent = new Map<string, { readonly to: string; readonly subject: string }>();

export function sendFakeMail(input: {
  readonly idempotencyKey: string;
  readonly to: string;
  readonly subject: string;
}): { readonly accepted: boolean; readonly idempotencyKey: string } {
  const accepted = !sent.has(input.idempotencyKey);
  if (accepted) sent.set(input.idempotencyKey, { to: input.to, subject: input.subject });
  return { accepted, idempotencyKey: input.idempotencyKey };
}

export function fakeMailLog(): readonly { readonly to: string; readonly subject: string }[] {
  return [...sent.values()];
}
