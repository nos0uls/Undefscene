import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode, normalizeGlobalVarName } from '../utils'

export function compileWaitUntil(node: RuntimeNode): CompiledAction {
  const varName = normalizeGlobalVarName(node.params?.condition_var)
  const equals = String(node.params?.condition_equals ?? '')
  const timeoutSeconds = Number(node.params?.timeout_seconds ?? 0)

  const guard: CompiledAction = {
    type: 'guard_global',
    var: varName,
    equals,
    if_false: 'wait_until_true',
    actions: []
  }

  if (timeoutSeconds > 0) {
    guard.stop_when = 'timeout'
    guard.end_timeout = timeoutSeconds
  } else {
    guard.stop_when = 'none'
  }

  return guard
}

export function compileRunFunction(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  const fn =
    (typeof node.params?.function_name === 'string' && node.params.function_name) ||
    (typeof node.params?.function === 'string' && node.params.function) ||
    ''

  if (fn) action.function = fn

  const rawArgs = node.params?.args

  if (Array.isArray(rawArgs)) {
    action.args = rawArgs
  } else if (typeof rawArgs === 'string') {
    const trimmed = rawArgs.trim()
    if (trimmed.length > 0) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) {
          action.args = parsed
        } else {
          action.args = [parsed]
        }
      } catch {
        // Invalid JSON ignored
      }
    }
  }

  return action
}

export function compileSetProperty(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  const kind =
    (typeof node.params?.kind === 'string' && node.params.kind) ||
    (typeof node.params?.target_kind === 'string' && node.params.target_kind) ||
    'instance'
  const property =
    (typeof node.params?.prop === 'string' && node.params.prop) ||
    (typeof node.params?.property === 'string' && node.params.property) ||
    (typeof node.params?.field === 'string' && node.params.field) ||
    ''

  if (kind) action.kind = kind
  if (kind !== 'camera' && typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (property) action.property = property

  const rawValue = node.params?.value
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim()
    if (trimmed.length > 0) {
      try {
        action.value = JSON.parse(trimmed) as unknown
      } catch {
        action.value = rawValue
      }
    }
  } else if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
    action.value = rawValue
  }

  return action
}

export function compilePartialControl(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.control_type === 'number') {
    action.control_type = node.params.control_type
  } else if (typeof node.params?.control_type === 'string') {
    const parsed = parseInt(node.params.control_type, 10)
    if (!isNaN(parsed)) action.control_type = parsed
  }
  const rawWhitelist = node.params?.whitelist
  if (typeof rawWhitelist === 'string') {
    const trimmed = rawWhitelist.trim()
    if (trimmed.length > 0) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        action.whitelist = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        action.whitelist = trimmed.split(',').map((s) => s.trim())
      }
    } else {
      action.whitelist = []
    }
  } else if (Array.isArray(rawWhitelist)) {
    action.whitelist = rawWhitelist
  }
  return action
}

export function compileScheduleAction(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node, ['action_type', 'action_params'])
  const delaySeconds = Number(node.params?.delay_seconds ?? 0)
  const actionType = typeof node.params?.action_type === 'string' ? node.params.action_type : ''
  const blocking = node.params?.blocking === true
  const tag = typeof node.params?.tag === 'string' ? node.params.tag : ''

  const innerAction: CompiledAction = { type: actionType }
  const rawParams = node.params?.action_params
  if (typeof rawParams === 'string') {
    const trimmed = rawParams.trim()
    if (trimmed.length > 0) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (k === 'type') continue
            innerAction[k] = v
          }
        }
      } catch {
        // Invalid JSON ignored
      }
    }
  } else if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
    for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
      if (k === 'type') continue
      innerAction[k] = v
    }
  }

  action.delay_seconds = delaySeconds
  action.action = innerAction
  action.blocking = blocking
  if (tag) action.tag = tag
  return action
}

export function compileTween(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.kind === 'string' && node.params.kind) action.kind = node.params.kind
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.prop === 'string' && node.params.prop) action.prop = node.params.prop
  else if (typeof node.params?.property === 'string' && node.params.property) {
    action.prop = node.params.property
  }
  if (typeof node.params?.end_value === 'number') action.end_value = node.params.end_value
  else if (typeof node.params?.to === 'number') action.end_value = node.params.to

  if (typeof node.params?.start_value_override === 'number') {
    action.start_value_override = node.params.start_value_override
  } else if (typeof node.params?.from === 'number') {
    action.start_value_override = node.params.from
  }

  if (typeof node.params?.seconds === 'number') {
    action.seconds = node.params.seconds
  } else if (typeof node.params?.duration_frames === 'number') {
    // Legacy exported files may still use duration_frames; treat it as seconds.
    action.seconds = node.params.duration_frames
  }

  if (typeof node.params?.ease_name === 'string' && node.params.ease_name) {
    action.ease_name = node.params.ease_name
  } else if (typeof node.params?.easing === 'string' && node.params.easing) {
    action.ease_name = node.params.easing
  }
  return action
}

export function compileDetach(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.destroy_after_detach === 'boolean') {
    action.destroy_after_detach = node.params.destroy_after_detach
  }
  return action
}

export function compileWaitForInteract(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.timeout === 'number') action.timeout = node.params.timeout
  if (typeof node.params?.timeout_action === 'string' && node.params.timeout_action) {
    action.timeout_action = node.params.timeout_action
  }
  if (typeof node.params?.interact_action === 'string' && node.params.interact_action) {
    action.interact_action = node.params.interact_action
  }
  return action
}

export function compileHalt(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  return action
}
