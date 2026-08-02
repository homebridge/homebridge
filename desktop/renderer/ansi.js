/* global window */

/**
 * Renders the ANSI escape sequences in Homebridge's log into DOM nodes.
 *
 * `hb-service` starts Homebridge with `-C` (force colour), so the log file the
 * app tails is full of SGR sequences. Building real nodes instead of assembling
 * markup keeps log content — which includes plugin output — from ever being
 * interpreted as HTML.
 *
 * Loaded as a classic script rather than a module: the shell pages are served
 * over `file://`, where module scripts are blocked by CORS.
 */
;(function (global) {
  'use strict'

  // Matching escape sequences is the entire job here, so the control characters
  // in this pattern are deliberate.
  // eslint-disable-next-line no-control-regex
  const ESCAPE_PATTERN = /\u001B\[([0-9;]*)m|\u001B\[[0-9;?]*[A-Za-z]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g

  const BASIC_COLOURS = ['#3b3f4a', '#f2777a', '#7ec699', '#e6c07b', '#6aa9f4', '#c792ea', '#56b6c2', '#c6ccd8']
  const BRIGHT_COLOURS = ['#5c6370', '#ff8b8e', '#98e0ad', '#f5d68a', '#8ec0ff', '#dcaeff', '#7fd4de', '#ffffff']
  const CUBE_STEPS = [0, 95, 135, 175, 215, 255]

  function emptyStyle() {
    return { background: null, bold: false, colour: null, dim: false, italic: false, underline: false }
  }

  function rgb(r, g, b) {
    return `rgb(${r},${g},${b})`
  }

  function clamp(value) {
    return Math.max(0, Math.min(255, value | 0))
  }

  /** Expand an xterm 256-colour index into a CSS colour. */
  function xterm256(index) {
    if (index < 8) {
      return BASIC_COLOURS[index]
    }
    if (index < 16) {
      return BRIGHT_COLOURS[index - 8]
    }
    if (index < 232) {
      const value = index - 16
      return rgb(CUBE_STEPS[Math.floor(value / 36) % 6], CUBE_STEPS[Math.floor(value / 6) % 6], CUBE_STEPS[value % 6])
    }

    const grey = 8 + (index - 232) * 10
    return rgb(grey, grey, grey)
  }

  /**
   * Apply one SGR sequence to the running style. Unknown codes are ignored so
   * an unexpected sequence degrades to plain text rather than breaking output.
   */
  function applyCodes(style, parameters) {
    const codes = parameters.split(';')

    for (let i = 0; i < codes.length; i++) {
      const code = Number.parseInt(codes[i], 10)

      if (Number.isNaN(code) || code === 0) {
        Object.assign(style, emptyStyle())
      } else if (code === 1) {
        style.bold = true
      } else if (code === 2) {
        style.dim = true
      } else if (code === 3) {
        style.italic = true
      } else if (code === 4) {
        style.underline = true
      } else if (code === 22) {
        style.bold = false
        style.dim = false
      } else if (code === 23) {
        style.italic = false
      } else if (code === 24) {
        style.underline = false
      } else if (code >= 30 && code <= 37) {
        style.colour = BASIC_COLOURS[code - 30]
      } else if (code >= 90 && code <= 97) {
        style.colour = BRIGHT_COLOURS[code - 90]
      } else if (code === 39) {
        style.colour = null
      } else if (code >= 40 && code <= 47) {
        style.background = BASIC_COLOURS[code - 40]
      } else if (code >= 100 && code <= 107) {
        style.background = BRIGHT_COLOURS[code - 100]
      } else if (code === 49) {
        style.background = null
      } else if (code === 38 || code === 48) {
        const target = code === 38 ? 'colour' : 'background'
        const mode = Number.parseInt(codes[i + 1], 10)

        if (mode === 5) {
          style[target] = xterm256(Number.parseInt(codes[i + 2], 10) || 0)
          i += 2
        } else if (mode === 2) {
          style[target] = rgb(
            clamp(Number.parseInt(codes[i + 2], 10)),
            clamp(Number.parseInt(codes[i + 3], 10)),
            clamp(Number.parseInt(codes[i + 4], 10)),
          )
          i += 4
        }
      }
    }
  }

  function appendText(fragment, text, style, doc) {
    if (!text) {
      return
    }

    const styled = style.colour || style.background || style.bold || style.dim || style.italic || style.underline

    if (!styled) {
      fragment.appendChild(doc.createTextNode(text))
      return
    }

    const span = doc.createElement('span')
    span.textContent = text

    if (style.colour) {
      span.style.color = style.colour
    }
    if (style.background) {
      span.style.backgroundColor = style.background
    }
    if (style.bold) {
      span.style.fontWeight = '600'
    }
    if (style.dim) {
      span.style.opacity = '0.65'
    }
    if (style.italic) {
      span.style.fontStyle = 'italic'
    }
    if (style.underline) {
      span.style.textDecoration = 'underline'
    }

    fragment.appendChild(span)
  }

  /**
   * Convert a log line into a DocumentFragment.
   */
  function ansiToFragment(line, doc) {
    const target = doc || global.document
    const fragment = target.createDocumentFragment()
    const style = emptyStyle()
    let lastIndex = 0
    let match

    ESCAPE_PATTERN.lastIndex = 0

    // eslint-disable-next-line no-cond-assign
    while ((match = ESCAPE_PATTERN.exec(line)) !== null) {
      appendText(fragment, line.slice(lastIndex, match.index), style, target)
      lastIndex = ESCAPE_PATTERN.lastIndex

      if (match[1] !== undefined) {
        applyCodes(style, match[1])
      }
    }

    appendText(fragment, line.slice(lastIndex), style, target)
    return fragment
  }

  /**
   * Strip escape sequences — used for the search filter and clipboard copies.
   */
  function stripAnsi(line) {
    return line.replace(ESCAPE_PATTERN, '')
  }

  global.HomebridgeAnsi = { ansiToFragment, stripAnsi }
})(typeof window === 'undefined' ? globalThis : window)
