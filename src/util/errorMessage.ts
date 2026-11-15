/**
 * The text of something that was thrown or rejected with. Anything can be
 * thrown, not only an Error: a text, null, a plain object.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error)
}
