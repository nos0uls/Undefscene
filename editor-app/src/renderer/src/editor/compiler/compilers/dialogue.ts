import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode } from '../utils'

export function compileSetDialogueSpeed(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.speed === 'number') action.speed = node.params.speed
  return action
}

export function compileWaitTyping(node: RuntimeNode): CompiledAction {
  return compileBaseNode(node)
}

export function compileDialogueControl(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.prevent_skip === 'boolean') {
    action.prevent_skip = node.params.prevent_skip
  }
  if (typeof node.params?.stay_open === 'boolean') action.stay_open = node.params.stay_open
  if (typeof node.params?.auto_advance === 'boolean') {
    action.auto_advance = node.params.auto_advance
  }
  return action
}

export function compileSetPortraitNext(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.emotion === 'string' && node.params.emotion) {
    action.emotion = node.params.emotion
  }
  return action
}

export function compileSetPortraitNow(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.target === 'string' && node.params.target) {
    action.target = node.params.target
  }
  if (typeof node.params?.emotion === 'string' && node.params.emotion) {
    action.emotion = node.params.emotion
  }
  return action
}

export function compileClearDialogue(node: RuntimeNode): CompiledAction {
  return compileBaseNode(node)
}
