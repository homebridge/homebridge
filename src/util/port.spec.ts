import { createServer } from 'node:net'

import { describe, expect, it } from 'vitest'

import { isPortInUse } from './port.js'

/** Listen on a free port, as another program would, until `close` is called. */
function holdPort(): Promise<{ port: number, close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, () => {
      resolve({
        port: (server.address() as { port: number }).port,
        close: () => new Promise<void>(done => server.close(() => done())),
      })
    })
  })
}

describe('isPortInUse', () => {
  it('says yes for a port another server is listening on, and no once it is free', async () => {
    const { port, close } = await holdPort()

    await expect(isPortInUse(port)).resolves.toBe(true)
    await close()
    await expect(isPortInUse(port)).resolves.toBe(false)
  })

  it('leaves the port free after asking', async () => {
    const { port, close } = await holdPort()
    await close()

    await isPortInUse(port)

    // a second ask would find the first one still listening otherwise
    await expect(isPortInUse(port)).resolves.toBe(false)
  })
})
