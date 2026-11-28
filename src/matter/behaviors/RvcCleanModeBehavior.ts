/**
 * RvcCleanMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner cleaning mode changes
 */

import { RvcCleanModeServer } from '@matter/main/behaviors/rvc-clean-mode'
import { RvcRunModeBehavior } from '@matter/main/behaviors/rvc-run-mode'
import { ModeBase, RvcRunMode } from '@matter/main/clusters'

import { changeToModeWithHandler } from './handlerResponse.js'
import { repairCurrentMode } from './modeRepair.js'

/**
 * Custom RvcCleanMode Server that calls plugin handlers
 */
export class HomebridgeRvcCleanModeServer extends RvcCleanModeServer {
  /** A saved mode the device no longer lists is replaced first, or matter.js refuses to start (#4057). */
  override initialize() {
    repairCurrentMode(this, 'rvcCleanMode')
    return super.initialize()
  }

  /**
   * Whether the RvcRunMode cluster's current mode carries the Idle tag.
   * An endpoint without a run mode cluster counts as idle - there is nothing to check against.
   */
  private isRunModeIdle(): boolean {
    const runMode = this.agent.maybeGet(RvcRunModeBehavior)
    if (!runMode) {
      return true
    }
    const { currentMode, supportedModes } = runMode.state
    const current = supportedModes.find(({ mode }) => mode === currentMode)
    return current?.modeTags.some(({ value }) => value === RvcRunMode.ModeTag.Idle) ?? false
  }

  /**
   * Handle change to mode command
   * Changes the vacuum's cleaning mode (e.g., quick clean, deep clean, spot clean)
   *
   * @param request - Mode change request containing the new mode
   * @returns Response indicating success or failure
   */
  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    return changeToModeWithHandler(this, 'rvcCleanMode', request, () => super.changeToMode(request), () => {
      // Without DirectModeChange the spec only allows clean-mode changes while the run mode is idle
      if (!(this.features as { directModeChange?: boolean }).directModeChange && !this.isRunModeIdle()) {
        return {
          status: ModeBase.ModeChangeStatus.InvalidInMode,
          statusText: 'Cannot change clean mode while the device is not idle',
        }
      }
    })
  }
}
