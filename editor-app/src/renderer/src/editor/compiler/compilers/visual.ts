import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode } from '../utils'

export function compileShakeObject(node: RuntimeNode): CompiledAction {
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

export function compileEmote(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.sprite === 'string' && node.params.sprite) {
    action.sprite = node.params.sprite
  }
  if (typeof node.params?.seconds === 'number') action.seconds = node.params.seconds
  if (typeof node.params?.offset_x === 'number') action.offset_x = node.params.offset_x
  if (typeof node.params?.offset_y === 'number') action.offset_y = node.params.offset_y
  if (typeof node.params?.scale === 'number') action.scale = node.params.scale
  if (typeof node.params?.wait === 'boolean') action.wait = node.params.wait
  return action
}

export function compileFlip(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.flipped === 'boolean') action.flipped = node.params.flipped
  return action
}

export function compileSpin(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.speed === 'number') action.speed = node.params.speed
  if (typeof node.params?.seconds === 'number') action.seconds = node.params.seconds
  return action
}

export function compileSetVisible(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.visible === 'boolean') action.visible = node.params.visible
  return action
}
