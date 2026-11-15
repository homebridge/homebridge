/**
 * Maps cluster attributes to Matter.js commands
 * This centralizes the logic for converting UI attribute updates to behavior commands
 *
 * Covers the clusters the Homebridge UI controls:
 * - Lights, switches and outlets (onOff, levelControl, colorControl)
 * - Fans and thermostats (attribute writes, which call the change handlers)
 * - Window coverings, door locks and water valves
 * - Robotic vacuums
 * - The mode clusters of water heaters, energy devices and EV chargers
 *
 * A cluster that is not listed here has no mapping, and asking for one throws.
 *
 * When a mapping returns null there is no command for the attributes, and the
 * caller writes them to the cluster state instead. So for a mapped cluster the
 * UI can write any attribute this file does not turn into a command (for
 * example doorLock lockState 0). The plugin is only told when the attribute
 * has a change handler (fan and thermostat).
 */

interface AttributeToCommandMapping {
  /**
   * Function that maps attributes to a command name and optional arguments
   */
  map: (attributes: Record<string, unknown>) => { command: string, args?: Record<string, unknown> } | null
}

/**
 * The options bitmap matter.js expects on level and colour commands. It is an
 * object of named bits, not a number: `optionsMask: 1` read as no bits at all,
 * so the "execute even if off" request was ignored, and a level command with no
 * options at all failed outright reading `optionsMask.executeIfOff` (#4029)
 */
const EXECUTE_IF_OFF = { executeIfOff: true }

/** Every Matter mode cluster changes its mode with the same command. */
function mapModeChange(attributes: Record<string, unknown>): { command: string, args?: Record<string, unknown> } | null {
  if ('currentMode' in attributes) {
    return {
      command: 'changeToMode',
      args: { newMode: attributes.currentMode },
    }
  }
  return null
}

/**
 * Central registry of attribute-to-command mappings for each cluster
 */
const CLUSTER_COMMAND_MAPPINGS: Record<string, AttributeToCommandMapping> = {
  // ============================================================================
  // BASIC LIGHTING & POWER
  // ============================================================================

  // OnOff Cluster - Used by lights, switches, outlets
  onOff: {
    map: (attributes) => {
      // Only a real boolean is a command. Anything else (the text "false",
      // for one) is left to the state write, where matter.js refuses it.
      if (attributes.onOff === true) {
        return { command: 'on' }
      }
      if (attributes.onOff === false) {
        return { command: 'off' }
      }
      return null
    },
  },

  // LevelControl Cluster - Used by dimmable lights
  levelControl: {
    map: (attributes) => {
      if ('currentLevel' in attributes) {
        return {
          command: 'moveToLevelWithOnOff',
          args: {
            level: attributes.currentLevel,
            transitionTime: null,
            optionsMask: EXECUTE_IF_OFF,
            optionsOverride: EXECUTE_IF_OFF,
          },
        }
      }
      return null
    },
  },

  // ============================================================================
  // COLOR CONTROL
  // ============================================================================

  // ColorControl Cluster - Used by color temperature and RGB lights
  colorControl: {
    map: (attributes) => {
      // Color temperature control (in mireds)
      if ('colorTemperatureMireds' in attributes) {
        return {
          command: 'moveToColorTemperature',
          args: {
            colorTemperatureMireds: attributes.colorTemperatureMireds,
            transitionTime: attributes.transitionTime ?? 0,
            optionsMask: EXECUTE_IF_OFF,
            optionsOverride: EXECUTE_IF_OFF, // Execute even if light is off
          },
        }
      }

      // XY color space control
      if ('colorX' in attributes && 'colorY' in attributes) {
        return {
          command: 'moveToColor',
          args: {
            colorX: attributes.colorX,
            colorY: attributes.colorY,
            transitionTime: attributes.transitionTime ?? 0,
            optionsMask: EXECUTE_IF_OFF,
            optionsOverride: EXECUTE_IF_OFF, // Execute even if light is off
          },
        }
      }

      // Hue & Saturation control
      if ('currentHue' in attributes && 'currentSaturation' in attributes) {
        return {
          command: 'moveToHueAndSaturation',
          args: {
            hue: attributes.currentHue,
            saturation: attributes.currentSaturation,
            transitionTime: attributes.transitionTime ?? 0,
            optionsMask: EXECUTE_IF_OFF,
            optionsOverride: EXECUTE_IF_OFF, // Execute even if light is off
          },
        }
      }

      // Only one of the two: move that one and leave the other as it is
      if ('currentHue' in attributes) {
        return {
          command: 'moveToHue',
          args: {
            hue: attributes.currentHue,
            direction: 0, // shortest way round
            transitionTime: attributes.transitionTime ?? 0,
            optionsMask: EXECUTE_IF_OFF,
            optionsOverride: EXECUTE_IF_OFF,
          },
        }
      }
      if ('currentSaturation' in attributes) {
        return {
          command: 'moveToSaturation',
          args: {
            saturation: attributes.currentSaturation,
            transitionTime: attributes.transitionTime ?? 0,
            optionsMask: EXECUTE_IF_OFF,
            optionsOverride: EXECUTE_IF_OFF,
          },
        }
      }

      return null
    },
  },

  // ============================================================================
  // FAN CONTROL
  // ============================================================================

  // FanControl Cluster - Used by fans
  // There is no command for the fan mode or the speed: the attribute is
  // written, and the write calls the fanModeChange / percentSettingChange
  // handler.
  fanControl: {
    map: () => null,
  },

  // ============================================================================
  // WINDOW COVERINGS (BLINDS)
  // ============================================================================

  // WindowCovering Cluster - Used by blinds, shades, curtains
  windowCovering: {
    map: (attributes) => {
      // Direct commands via _command attribute
      if ('_command' in attributes) {
        const cmd = attributes._command as string

        if (cmd === 'upOrOpen' || cmd === 'downOrClose' || cmd === 'stopMotion') {
          return { command: cmd }
        }
      }

      // Position control (lift)
      if ('targetPositionLiftPercent100ths' in attributes) {
        return {
          command: 'goToLiftPercentage',
          args: {
            liftPercent100thsValue: attributes.targetPositionLiftPercent100ths,
          },
        }
      }

      // Position control (tilt) - for venetian blinds
      if ('targetPositionTiltPercent100ths' in attributes) {
        return {
          command: 'goToTiltPercentage',
          args: {
            tiltPercent100thsValue: attributes.targetPositionTiltPercent100ths,
          },
        }
      }

      return null
    },
  },

  // ============================================================================
  // DOOR LOCK
  // ============================================================================

  // DoorLock Cluster
  doorLock: {
    map: (attributes) => {
      // Direct command via _command attribute
      if ('_command' in attributes) {
        const cmd = attributes._command as string

        if (cmd === 'lockDoor' || cmd === 'unlockDoor') {
          return { command: cmd }
        }
      }

      // Or via lockState attribute (1 = Locked, 2 = Unlocked). Other enum
      // values (e.g. 0 = NotFullyLocked, 3 = Unlatched) must not trigger a
      // command - especially not an unlock.
      if (attributes.lockState === 1) {
        return { command: 'lockDoor' }
      }
      if (attributes.lockState === 2) {
        return { command: 'unlockDoor' }
      }

      return null
    },
  },

  // ============================================================================
  // WATER VALVE
  // ============================================================================

  // ValveConfigurationAndControl Cluster - Used by water valves
  valveConfigurationAndControl: {
    map: (attributes) => {
      // Direct command via _command attribute
      if ('_command' in attributes) {
        const cmd = attributes._command as string

        if (cmd === 'open' || cmd === 'close') {
          return { command: cmd }
        }
      }

      // Or via targetState attribute (0 = Closed, 1 = Open). Other enum
      // values (e.g. 2 = Transitioning) must not trigger a command.
      if (attributes.targetState === 1) {
        return { command: 'open' }
      }
      if (attributes.targetState === 0) {
        return { command: 'close' }
      }

      return null
    },
  },

  // ============================================================================
  // THERMOSTAT
  // ============================================================================

  // Thermostat Cluster
  thermostat: {
    map: (attributes) => {
      // Setpoint raise/lower command
      if ('_command' in attributes && attributes._command === 'setpointRaiseLower') {
        return {
          command: 'setpointRaiseLower',
          args: {
            mode: attributes.mode ?? 0,
            amount: attributes.amount ?? 10,
          },
        }
      }

      // The system mode and the setpoints have no command: the attribute is
      // written, and the write calls the plugin's change handler.
      return null
    },
  },

  // ============================================================================
  // ROBOTIC VACUUM
  // ============================================================================

  // Robotic Vacuum Operational State - for action buttons (pause, resume, goHome)
  // Note: Start/stop is controlled via rvcRunMode.changeToMode, not rvcOperationalState.
  // The behavior supports: pause, resume, goHome
  rvcOperationalState: {
    map: (attributes) => {
      // Direct command invocation via _command attribute
      if ('_command' in attributes) {
        const cmd = attributes._command as string
        if (cmd === 'pause' || cmd === 'resume' || cmd === 'goHome') {
          return { command: cmd }
        }
        return null
      }

      // Handle operationalState attribute changes
      // Map state values to available commands:
      // 1 = Running → resume, 2 = Paused → pause
      // Other states (0=Stopped, 64+=dock states) → state-only update
      if ('operationalState' in attributes) {
        const state = attributes.operationalState as number
        switch (state) {
          case 1: // Running
            return { command: 'resume' }
          case 2: // Paused
            return { command: 'pause' }
          default:
            return null // State-only update for stopped/docked/charging etc.
        }
      }

      return null
    },
  },

  // Robotic Vacuum Run Mode - for mode selection (Idle, Cleaning, Mapping)
  rvcRunMode: { map: mapModeChange },

  // Robotic Vacuum Clean Mode - for cleaning method selection (Vacuum, Mop, etc.)
  rvcCleanMode: { map: mapModeChange },

  // Service Area - for room/zone selection
  serviceArea: {
    map: (attributes) => {
      // Select multiple areas
      if ('selectedAreas' in attributes && Array.isArray(attributes.selectedAreas)) {
        return {
          command: 'selectAreas',
          args: { newAreas: attributes.selectedAreas },
        }
      }
      // Skip a single area
      if ('skipArea' in attributes) {
        return {
          command: 'skipArea',
          args: { skippedArea: attributes.skipArea },
        }
      }
      return null
    },
  },

  // ============================================================================
  // WATER HEATERS, ENERGY DEVICES, EV CHARGERS
  // ============================================================================

  // The mode clusters all work like the vacuum's
  waterHeaterMode: { map: mapModeChange },
  deviceEnergyManagementMode: { map: mapModeChange },
  energyEvseMode: { map: mapModeChange },
}

/**
 * Maps attributes to a Matter.js command for a given cluster
 * @param cluster The cluster name (e.g., 'onOff', 'levelControl')
 * @param attributes The attributes to map
 * @returns Command name and optional arguments, or null when the attributes
 * have no command and the caller should write them to the state instead
 * (for a fan mode or a thermostat setpoint, that write calls the handler)
 * @throws when the cluster has no mapping at all
 */
export function mapAttributesToCommand(
  cluster: string,
  attributes: Record<string, unknown>,
): { command: string, args?: Record<string, unknown> } | null {
  const mapping = CLUSTER_COMMAND_MAPPINGS[cluster]

  if (!mapping) {
    throw new Error(`Command mapping not implemented for cluster: ${cluster}`)
  }

  return mapping.map(attributes)
}
