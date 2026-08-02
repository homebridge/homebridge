import { beforeAll, describe, expect, it } from 'vitest'

const ESC = '\u001B'

/**
 * The renderer runs as a classic script on a `file://` page, so it publishes
 * itself on the global object rather than exporting. Importing it here has the
 * same effect.
 */
let ansi

beforeAll(async () => {
  await import('./ansi.js')
  ansi = globalThis.HomebridgeAnsi
})

/**
 * Just enough of the DOM for `ansiToFragment`, so the renderer can be tested
 * without pulling in a DOM implementation.
 */
function fakeDocument() {
  const node = (type) => {
    const self = {
      appendChild(child) {
        self.children.push(child)
        return child
      },
      children: [],
      style: {},
      textContent: '',
      type,
    }
    return self
  }

  return {
    createDocumentFragment: () => node('fragment'),
    createElement: () => node('span'),
    createTextNode: (text) => {
      const textNode = node('text')
      textNode.textContent = text
      return textNode
    },
  }
}

function flatten(fragment) {
  return fragment.children.map(child => ({
    style: child.style,
    text: child.textContent,
    type: child.type,
  }))
}

describe('stripAnsi', () => {
  it('removes colour sequences but keeps the text', () => {
    expect(ansi.stripAnsi(`${ESC}[36m[HB Supervisor]${ESC}[39m ready`)).toBe('[HB Supervisor] ready')
  })

  it('removes cursor movement and operating system commands', () => {
    expect(ansi.stripAnsi(`${ESC}[2Kline${ESC}]0;title${ESC}\\ end`)).toBe('line end')
  })

  it('leaves text without escape sequences untouched', () => {
    expect(ansi.stripAnsi('[8/2/2026] plain log line')).toBe('[8/2/2026] plain log line')
  })
})

describe('ansiToFragment', () => {
  it('emits a bare text node when nothing is styled', () => {
    const parts = flatten(ansi.ansiToFragment('plain', fakeDocument()))

    expect(parts).toStrictEqual([{ style: {}, text: 'plain', type: 'text' }])
  })

  it('wraps coloured runs in styled spans and resets afterwards', () => {
    const parts = flatten(ansi.ansiToFragment(`before${ESC}[31mred${ESC}[0mafter`, fakeDocument()))

    expect(parts.map(part => part.text)).toStrictEqual(['before', 'red', 'after'])
    expect(parts[0].type).toBe('text')
    expect(parts[1].type).toBe('span')
    expect(parts[1].style.color).toBe('#f2777a')
    expect(parts[2].type).toBe('text')
  })

  it('carries style across separate sequences', () => {
    const parts = flatten(ansi.ansiToFragment(`${ESC}[1m${ESC}[4mloud`, fakeDocument()))

    expect(parts[0].style.fontWeight).toBe('600')
    expect(parts[0].style.textDecoration).toBe('underline')
  })

  it('understands 256-colour and true-colour sequences', () => {
    const cube = flatten(ansi.ansiToFragment(`${ESC}[38;5;196mred`, fakeDocument()))
    const truecolour = flatten(ansi.ansiToFragment(`${ESC}[38;2;10;20;30mexact`, fakeDocument()))

    expect(cube[0].style.color).toBe('rgb(255,0,0)')
    expect(truecolour[0].style.color).toBe('rgb(10,20,30)')
  })

  it('ignores sequences it does not implement rather than dropping text', () => {
    const parts = flatten(ansi.ansiToFragment(`${ESC}[73mtext`, fakeDocument()))

    expect(parts.map(part => part.text)).toStrictEqual(['text'])
  })

  it('never leaks escape characters into the rendered text', () => {
    const parts = flatten(ansi.ansiToFragment(`${ESC}[36m[UI]${ESC}[39m up`, fakeDocument()))

    expect(parts.map(part => part.text).join('')).toBe('[UI] up')
  })
})
