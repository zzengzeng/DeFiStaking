/** User-facing guard when crank is forbidden (e.g. operational pause). */
export class CatchUpBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatchUpBlockedError";
  }
}
