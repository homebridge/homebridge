/**
 * Type Helpers for Matter.js
 *
 * Provides proper TypeScript types for Matter.js APIs that don't have
 * complete type definitions.
 */

import type { EndpointType } from '@matter/main'
import type { Behavior } from '@matter/node'

export type BehaviorType = Behavior.Type

/**
 * Extended EndpointType with .with() method
 * Matter.js device types support adding behaviors via .with()
 */
export interface ExtendableEndpointType extends EndpointType {
  with: (...behaviors: BehaviorType[]) => ExtendableEndpointType
}

/**
 * Extended BehaviorType with .with() method
 * Matter.js behaviors support adding features via .with()
 */
export interface ExtendableBehaviorType extends BehaviorType {
  with: (...features: string[]) => ExtendableBehaviorType
}

/**
 * Type guard to check if an EndpointType supports .with()
 */
export function isExtendableEndpointType(type: EndpointType): type is ExtendableEndpointType {
  return 'with' in type && typeof (type as Record<string, unknown>).with === 'function'
}

/**
 * Type guard to check if a BehaviorType supports .with()
 */
export function isExtendableBehaviorType(type: BehaviorType): type is ExtendableBehaviorType {
  return 'with' in type && typeof (type as Record<string, unknown>).with === 'function'
}

/**
 * Safely add behaviors to a device type
 */
export function withBehaviors(deviceType: EndpointType, behaviors: BehaviorType[]): EndpointType {
  if (behaviors.length === 0) {
    return deviceType
  }

  if (isExtendableEndpointType(deviceType)) {
    return deviceType.with(...behaviors)
  }

  throw new Error('Device type does not support adding behaviors')
}

/**
 * Safely add features to a behavior
 */
export function withFeatures(behavior: BehaviorType, features: string[]): BehaviorType {
  if (features.length === 0) {
    return behavior
  }

  if (isExtendableBehaviorType(behavior)) {
    return behavior.with(...features)
  }

  throw new Error('Behavior does not support adding features')
}

/**
 * Check if a device type matches a specific type by name
 * Used because Matter.js doesn't provide proper type guards
 */
export function isDeviceType(deviceType: EndpointType, targetType: EndpointType): boolean {
  // Direct reference comparison
  if (deviceType === targetType) {
    return true
  }

  // Check by name property (fallback for modified types)
  const deviceTypeName = 'name' in deviceType ? (deviceType as { name?: string }).name : undefined
  const targetTypeName = 'name' in targetType ? (targetType as { name?: string }).name : undefined

  return deviceTypeName !== undefined && deviceTypeName === targetTypeName
}
