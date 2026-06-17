import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode } from '../utils'

export function compileMoveRelative(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.dx === 'number') action.dx = node.params.dx
  if (typeof node.params?.dy === 'number') action.dy = node.params.dy
  if (typeof node.params?.speed_px_sec === 'number') {
    action.speed_px_sec = node.params.speed_px_sec
  }
  if (typeof node.params?.collision === 'boolean') action.collision = node.params.collision
  return action
}

export function compileSetPositionRelative(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.dx === 'number') action.dx = node.params.dx
  if (typeof node.params?.dy === 'number') action.dy = node.params.dy
  return action
}

export function compileJump(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.x === 'number') action.x = node.params.x
  if (typeof node.params?.y === 'number') action.y = node.params.y
  if (typeof node.params?.seconds === 'number') action.seconds = node.params.seconds
  if (typeof node.params?.height === 'number') action.height = node.params.height
  if (typeof node.params?.easing === 'string' && node.params.easing) {
    action.easing = node.params.easing
  }
  return action
}

export function compileFollowPath(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  const rawPoints = node.params?.points
  if (typeof rawPoints === 'string' && rawPoints.trim().length > 0) {
    try {
      action.points = JSON.parse(rawPoints) as unknown
    } catch {
      action.points = rawPoints
    }
  } else if (rawPoints !== undefined) {
    action.points = rawPoints
  }
  if (typeof node.params?.speed_px_sec === 'number') {
    action.speed_px_sec = node.params.speed_px_sec
  }
  if (typeof node.params?.collision === 'boolean') action.collision = node.params.collision
  if (typeof node.params?.autofacing === 'boolean') action.autofacing = node.params.autofacing
  return action
}
