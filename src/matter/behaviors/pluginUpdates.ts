/**
 * Tells a change a plugin reported apart from a change somebody asked for.
 *
 * Fan control and the thermostat have no command for "set the fan mode" or
 * "set the setpoint": a controller writes the attribute, and the Homebridge
 * behavior reacts to the change by calling the plugin's handler. A plugin
 * reporting what its device already did (updateAccessoryState) writes the same
 * attribute, and matter.js raises the same change event. Calling the handler
 * then would tell the plugin to set its device to the value the device just
 * reported.
 *
 * So StateManager notes the values a plugin is writing, and the behaviors ask
 * here before they call a handler. A note is used once, by the change event it
 * was made for; that event may arrive late (a reaction waits for an earlier
 * one to finish), so a note is not dropped on a timer.
 *
 * A light module on purpose: it imports nothing from matter.js.
 */

/** The attributes whose change calls a plugin handler, per cluster. */
export const HANDLED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  fanControl: ['fanMode', 'percentSetting'],
  thermostat: ['systemMode', 'occupiedHeatingSetpoint', 'occupiedCoolingSetpoint'],
}

const pluginUpdates = new WeakMap<object, Map<string, unknown>>()

/**
 * Note the values a plugin is about to write to an endpoint. Only attributes
 * that call a handler and whose value really changes are noted, as no change
 * event follows for the others.
 *
 * @returns the noted attribute names, for forgetPluginUpdate()
 */
export function notePluginUpdate(endpoint: object, cluster: string, attributes: Record<string, unknown>, current: Record<string, unknown> | undefined): string[] {
  const noted: string[] = []
  for (const attribute of HANDLED_ATTRIBUTES[cluster] ?? []) {
    if (!(attribute in attributes) || Object.is(attributes[attribute], current?.[attribute])) {
      continue
    }
    let updates = pluginUpdates.get(endpoint)
    if (!updates) {
      updates = new Map()
      pluginUpdates.set(endpoint, updates)
    }
    updates.set(`${cluster}.${attribute}`, attributes[attribute])
    noted.push(attribute)
  }
  return noted
}

/** Drop notes again, for a write that failed (no change event will come). */
export function forgetPluginUpdate(endpoint: object, cluster: string, attributeNames: string[]): void {
  const updates = pluginUpdates.get(endpoint)
  for (const attribute of attributeNames) {
    updates?.delete(`${cluster}.${attribute}`)
  }
}

/**
 * Whether this change is one a plugin reported. Uses up the note, so the next
 * change to the same value counts as asked for again.
 */
export function isPluginUpdate(endpoint: object, cluster: string, attribute: string, value: unknown): boolean {
  const updates = pluginUpdates.get(endpoint)
  const key = `${cluster}.${attribute}`
  if (!updates?.has(key) || !Object.is(updates.get(key), value)) {
    return false
  }
  updates.delete(key)
  return true
}
