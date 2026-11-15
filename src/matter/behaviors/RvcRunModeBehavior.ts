/**
 * RvcRunMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner run mode changes
 */

import type { ModeBase } from '@matter/main/clusters'

import { RvcRunModeServer } from '@matter/main/behaviors/rvc-run-mode'

import { changeToModeWithHandler } from './handlerResponse.js'

/**
 * Custom RvcRunMode Server that calls plugin handlers. The plugin is told
 * first, and only about a mode the vacuum lists (see changeToModeWithHandler).
 */
export class HomebridgeRvcRunModeServer extends RvcRunModeServer {
  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    return changeToModeWithHandler(this, 'rvcRunMode', request, () => super.changeToMode(request))
  }
}
