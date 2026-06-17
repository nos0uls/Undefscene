import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode } from '../utils'

export function compileCheckpointState(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.checkpoint_id === 'string' && node.params.checkpoint_id) {
    action.checkpoint_id = node.params.checkpoint_id
  }
  if (typeof node.params?.include_actors === 'boolean') {
    action.include_actors = node.params.include_actors
  }
  if (typeof node.params?.include_player === 'boolean') {
    action.include_player = node.params.include_player
  }
  if (typeof node.params?.include_camera === 'boolean') {
    action.include_camera = node.params.include_camera
  }
  if (typeof node.params?.include_music === 'boolean') {
    action.include_music = node.params.include_music
  }
  const rawGlobals = node.params?.include_globals
  if (typeof rawGlobals === 'string' && rawGlobals.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawGlobals)
      if (Array.isArray(parsed)) action.include_globals = rawGlobals
    } catch {
      // Invalid JSON ignored
    }
  }
  const rawInstances = node.params?.include_instances
  if (typeof rawInstances === 'string' && rawInstances.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawInstances)
      if (Array.isArray(parsed)) action.include_instances = rawInstances
    } catch {
      // Invalid JSON ignored
    }
  }
  return action
}

export function compileRestoreState(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.checkpoint_id === 'string' && node.params.checkpoint_id) {
    action.checkpoint_id = node.params.checkpoint_id
  }
  if (typeof node.params?.cleanup_transients === 'boolean') {
    action.cleanup_transients = node.params.cleanup_transients
  }
  if (typeof node.params?.restore_camera === 'boolean') {
    action.restore_camera = node.params.restore_camera
  }
  if (typeof node.params?.restore_music === 'boolean') {
    action.restore_music = node.params.restore_music
  }
  if (typeof node.params?.on_missing === 'string') {
    action.on_missing = node.params.on_missing
  }
  return action
}

export function compileSetFlag(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.key === 'string' && node.params.key) {
    action.key = node.params.key
  }
  const rawVal = node.params?.value
  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim()
    if (trimmed.length > 0) {
      try {
        action.value = JSON.parse(trimmed) as unknown
      } catch {
        action.value = rawVal
      }
    }
  } else if (rawVal !== undefined) {
    action.value = rawVal
  }
  return action
}

export function compileSpawnEntity(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.object === 'string' && node.params.object) {
    action.object = node.params.object
  }
  if (typeof node.params?.key === 'string' && node.params.key) {
    action.key = node.params.key
  }
  if (typeof node.params?.x === 'number') action.x = node.params.x
  if (typeof node.params?.y === 'number') action.y = node.params.y
  if (typeof node.params?.depth === 'number') action.depth = node.params.depth
  if (typeof node.params?.persistent === 'boolean') action.persistent = node.params.persistent
  return action
}

export function compileDestroyEntity(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  return action
}

export function compileSetPlot(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.value === 'string' && node.params.value) {
    action.value = node.params.value
  }
  return action
}
