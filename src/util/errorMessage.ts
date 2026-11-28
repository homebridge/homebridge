import { inspect } from 'node:util'

/**
 * The text of something that was thrown or rejected with. Anything can be
 * thrown, not only an Error: a text, null, a plain object. A plain object is
 * shown with what is in it ({ code: 'EIO' }), not as "[object Object]".
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string'
    ? error
    : inspect(error, { breakLength: Infinity })
}
