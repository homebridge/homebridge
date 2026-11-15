import process from 'node:process'

import { Logger } from '../logger.js'

const log = Logger.internal

/**
 * Send a message to the parent process over IPC, when there is a parent and
 * its channel is open.
 *
 * `process.send` stays defined after the parent has gone. Calling it then
 * raises ERR_IPC_CHANNEL_CLOSED as an `error` event on `process`, which is an
 * uncaught exception: a lost parent (the UI, or the main process of a child
 * bridge) took the process down at its next status message. So the channel is
 * checked first, and the callback takes the error of a send that still fails
 * because the channel closed in between.
 */
export function sendToParent(message: unknown): void {
  if (!process.send || !process.connected) {
    return
  }

  process.send(message, undefined, undefined, (error) => {
    if (error) {
      log.debug('Could not send a message to the parent process:', error.message)
    }
  })
}
