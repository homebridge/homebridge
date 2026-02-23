/**
 * Maps cluster attributes to Matter.js commands
 * This centralizes the logic for converting UI attribute updates to behavior commands
 *
 * Supports all Matter device types including:
 * - Lights (OnOff, Dimmable, Color Temperature, Color, Extended Color)
 * - Switches and Outlets
 * - Fans
 * - Window Coverings (Blinds)
 * - Door Locks
 * - Thermostats
 * - Robotic Vacuums
 */

interface AttributeToCommandMapping {
  /**
   * Function that maps attributes to a command name and optional arguments
   */
  map: (attributes: Record<string, unknown>) => { command: string, args?: Record<string, unknown> } | null
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
      if ('onOff' in attributes) {
        return {
          command: attributes.onOff ? 'on' : 'off',
        }
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
          args: { level: attributes.currentLevel },
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
            optionsMask: 1, // Bit 0 = ExecuteIfOff
            optionsOverride: 1, // Execute even if light is off
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
            optionsMask: 1, // Bit 0 = ExecuteIfOff
            optionsOverride: 1, // Execute even if light is off
          },
        }
      }

      // Hue & Saturation control
      if ('currentHue' in attributes || 'currentSaturation' in attributes) {
        return {
          command: 'moveToHueAndSaturation',
          args: {
            hue: attributes.currentHue ?? 0,
            saturation: attributes.currentSaturation ?? 0,
            transitionTime: attributes.transitionTime ?? 0,
            optionsMask: 1, // Bit 0 = ExecuteIfOff
            optionsOverride: 1, // Execute even if light is off
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
  // Fan mode and percent changes trigger change handlers automatically via attribute updates
  fanControl: {
    map: (attributes) => {
      // Fan mode change
      if ('fanMode' in attributes) {
        // This triggers fanModeChange handler automatically
        // No explicit command needed - just update the attribute
        return null
      }

      // Percent setting change
      if ('percentSetting' in attributes) {
        // This triggers percentSettingChange handler automatically
        // No explicit command needed - just update the attribute
        return null
      }

      return null
    },
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

      // Or via lockState attribute
      if ('lockState' in attributes) {
        // 1 = Locked, 2 = Unlocked
        return {
          command: attributes.lockState === 1 ? 'lockDoor' : 'unlockDoor',
        }
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

      // System mode change
      if ('systemMode' in attributes) {
        // This triggers systemModeChange handler automatically
        // No explicit command needed - just update the attribute
        return null
      }

      // Heating setpoint change
      if ('occupiedHeatingSetpoint' in attributes) {
        // This triggers occupiedHeatingSetpointChange handler automatically
        return null
      }

      // Cooling setpoint change
      if ('occupiedCoolingSetpoint' in attributes) {
        // This triggers occupiedCoolingSetpointChange handler automatically
        return null
      }

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
  rvcRunMode: {
    map: (attributes) => {
      if ('currentMode' in attributes) {
        return {
          command: 'changeToMode',
          args: { newMode: attributes.currentMode },
        }
      }
      return null
    },
  },

  // Robotic Vacuum Clean Mode - for cleaning method selection (Vacuum, Mop, etc.)
  rvcCleanMode: {
    map: (attributes) => {
      if ('currentMode' in attributes) {
        return {
          command: 'changeToMode',
          args: { newMode: attributes.currentMode },
        }
      }
      return null
    },
  },

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
}

/**
 * Maps attributes to a Matter.js command for a given cluster
 * @param cluster The cluster name (e.g., 'onOff', 'levelControl')
 * @param attributes The attributes to map
 * @returns Command name and optional arguments, or throws if mapping not found
 *
 * Note: Some attribute changes trigger handlers automatically without explicit commands.
 * In these cases, the mapper returns null, which should be handled by the caller
 * to update state directly instead of invoking a command.
 */
export function mapAttributesToCommand(
  cluster: string,
  attributes: Record<string, unknown>,
): { command: string, args?: Record<string, unknown> } | null {
  const mapping = CLUSTER_COMMAND_MAPPINGS[cluster]

  if (!mapping) {
    throw new Error(`Command mapping not implemented for cluster: ${cluster}`)
  }

  const result = mapping.map(attributes)

  if (result === null) {
    // Some clusters trigger change handlers automatically via attribute updates
    // These don't need explicit commands (e.g., fanMode, systemMode changes)
    // The caller should handle null by updating state directly
    return null
  }

  return result
}
