import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode } from '../utils'

export function compileCameraShake(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  const p = node.params
  if (p) {
    if (typeof p.seconds === 'number') action.seconds = p.seconds
    const hasMx = typeof p.magnitude_x === 'number'
    const hasMy = typeof p.magnitude_y === 'number'
    if (hasMx || hasMy) {
      if (hasMx) action.magnitude_x = p.magnitude_x
      if (hasMy) action.magnitude_y = p.magnitude_y
    } else if (typeof p.magnitude === 'number') {
      action.magnitude = p.magnitude
    }
    if (typeof p.decay === 'boolean') action.decay = p.decay
    if (typeof p.frequency === 'number') action.frequency = p.frequency
  }
  return action
}

export function compileTweenCamera(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.property === 'string' && node.params.property) {
    action.property = node.params.property
  }
  if (typeof node.params?.to_value === 'number') action.to_value = node.params.to_value
  if (typeof node.params?.from_value === 'number') action.from_value = node.params.from_value
  if (typeof node.params?.seconds === 'number') action.seconds = node.params.seconds
  if (typeof node.params?.easing === 'string' && node.params.easing) {
    action.easing = node.params.easing
  }
  return action
}
