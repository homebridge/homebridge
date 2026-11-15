import { Logger } from '../logger.js'

const log = Logger.internal

/** The shape of a HomeKit setup code: eight digits, written as 031-45-154. */
const PIN_FORMAT = /^\d{3}-\d{2}-\d{3}$/

/** Setup codes HomeKit refuses, as they are too easy to guess. */
const REFUSED_PINS = new Set([
  ...Array.from({ length: 10 }, (_, digit) => `${digit}`.repeat(3).concat('-', `${digit}`.repeat(2), '-', `${digit}`.repeat(3))),
  '123-45-678',
  '876-54-321',
])

/**
 * The setup code Homebridge uses when the config has none, and the one in
 * `config-sample.json`. It is public, so every bridge that keeps it can be
 * paired, while it is not paired yet, by anyone on the same network who knows it.
 */
export const DEFAULT_PIN = '031-45-154'

/**
 * Check the setup code (`pin`) of a bridge.
 *
 * HAP-NodeJS stores whatever it is given. A pin that is not a text made the
 * start-up fail with a TypeError that did not name the pin, so that is an error
 * here. A text in the wrong shape, or a code HomeKit refuses, only gets a
 * warning: a bridge that is paired already keeps working with it, it just can
 * not be paired again.
 *
 * @param pin - the value from the config
 * @param setting - the name of the setting, for the message (`bridge.pin`)
 */
export function validatePin(pin: unknown, setting: string): void {
  if (typeof pin !== 'string') {
    throw new TypeError(`Not a valid pin in ${setting}: ${JSON.stringify(pin)}. It must be a text of 8 digits in the form "031-45-154" (in quotes).`)
  }
  if (!PIN_FORMAT.test(pin)) {
    log.warn(`The pin in ${setting} is not in the form "031-45-154" (3 digits, 2 digits, 3 digits, with dashes). The Home app can not pair with a pin in another form.`)
  } else if (REFUSED_PINS.has(pin)) {
    log.warn(`The pin in ${setting} is one that HomeKit refuses, as it is too easy to guess. The Home app may not pair with it: choose another one.`)
  } else if (pin === DEFAULT_PIN) {
    log.warn(`${setting} is ${DEFAULT_PIN}, the well-known default setup code. While the bridge is not paired, anyone on your network who knows it can pair with it: set a pin of your own in config.json.`)
  }
}
