import { describe, expect, it } from 'vitest'

import { errorMessage } from './errorMessage.js'

describe('errorMessage', () => {
  it('gives the message of an Error', () => {
    expect(errorMessage(new Error('disk is full'))).toBe('disk is full')
    expect(errorMessage(new TypeError('not a text'))).toBe('not a text')
  })

  it.each([
    { thrown: 'just a text', expected: 'just a text' },
    { thrown: 42, expected: '42' },
    { thrown: null, expected: 'null' },
    { thrown: undefined, expected: 'undefined' },
    {
      thrown: { code: 'EIO' },
      expected: '{ code: \'EIO\' }',
    },
    {
      thrown: {
        reason: 'offline',
        retry: { after: 5 },
      },
      expected: '{ reason: \'offline\', retry: { after: 5 } }',
    },
  ])('gives a text for $thrown, which is not an Error', ({ thrown, expected }) => {
    expect(errorMessage(thrown)).toBe(expected)
  })
})
