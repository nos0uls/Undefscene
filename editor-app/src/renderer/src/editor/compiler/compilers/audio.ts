import type { RuntimeNode } from '../../runtimeTypes'
import type { CompiledAction } from '../types'
import { compileBaseNode } from '../utils'

export function compilePlayMusic(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.sound === 'string' && node.params.sound) {
    action.sound = node.params.sound
  }
  if (typeof node.params?.volume === 'number') action.volume = node.params.volume
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileStopMusic(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileMusicVolume(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.volume === 'number') action.volume = node.params.volume
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileMusicDuck(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.multiplier === 'number') action.multiplier = node.params.multiplier
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileMusicUnduck(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileMusicPitch(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.pitch === 'number') action.pitch = node.params.pitch
  return action
}

export function compileMusicPause(node: RuntimeNode): CompiledAction {
  return compileBaseNode(node)
}

export function compileMusicResume(node: RuntimeNode): CompiledAction {
  return compileBaseNode(node)
}

export function compilePlayBossMusic(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.calm === 'string' && node.params.calm) {
    action.calm = node.params.calm
  }
  if (typeof node.params?.battle === 'string' && node.params.battle) {
    action.battle = node.params.battle
  }
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileStopBossMusic(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compileBossMusicPhase(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.phases === 'string' && node.params.phases) {
    try {
      action.phases = JSON.parse(node.params.phases) as unknown
    } catch {
      action.phases = node.params.phases
    }
  }
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compilePlayMusicIntro(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.intro === 'string' && node.params.intro) {
    action.intro = node.params.intro
  }
  if (typeof node.params?.loop === 'string' && node.params.loop) {
    action.loop = node.params.loop
  }
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}

export function compilePlayMusicIntroLayered(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.intro === 'string' && node.params.intro) {
    action.intro = node.params.intro
  }
  if (typeof node.params?.calm === 'string' && node.params.calm) {
    action.calm = node.params.calm
  }
  if (typeof node.params?.battle === 'string' && node.params.battle) {
    action.battle = node.params.battle
  }
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  if (typeof node.params?.start_intensity === 'number') {
    action.start_intensity = node.params.start_intensity
  }
  return action
}

export function compileCrossfadeMusic(node: RuntimeNode): CompiledAction {
  const action = compileBaseNode(node)
  if (typeof node.params?.intensity === 'number') action.intensity = node.params.intensity
  if (typeof node.params?.fade === 'number') action.fade = node.params.fade
  return action
}
