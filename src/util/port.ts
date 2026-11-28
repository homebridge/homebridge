import { createServer } from 'node:net'

/**
 * Whether another program is listening on a TCP port already.
 *
 * HAP-NodeJS has no error listener on the server it opens for an accessory, so
 * a port that is taken ends the process with an uncaught EADDRINUSE. Asking
 * first lets Homebridge say what is wrong, and pick another port where it can.
 * The port is tried on every address, as HAP-NodeJS listens by default. Any
 * other problem with the port counts as "not in use": it is then left to
 * HAP-NodeJS to report.
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', (error: Error & { code?: string }) => {
      resolve(error.code === 'EADDRINUSE')
    })
    probe.listen(port, () => {
      probe.close(() => resolve(false))
    })
  })
}
