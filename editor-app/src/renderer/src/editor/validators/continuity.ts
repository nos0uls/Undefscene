import type { RuntimeNode, RuntimeEdge } from '../runtimeTypes'
import type { ValidationEntry } from './types'

const ACTOR_REF_TYPES = new Set([
  'move',
  'move_relative',
  'set_position',
  'set_position_relative',
  'animate',
  'set_animation_frame',
  'camera_track',
  'camera_track_until_stop',
  'camera_pan_obj',
  'set_depth',
  'set_facing',
  'follow_path',
  'auto_facing',
  'auto_walk',
  'emote',
  'halt',
  'flip',
  'spin',
  'shake_object',
  'set_visible',
  'tween',
  'actor_destroy',
  'destroy_entity',
  'attach_to_target',
  'detach'
])

const CAMERA_OVERRIDE_TYPES = new Set([
  'camera_track',
  'camera_pan',
  'camera_pan_obj',
  'camera_shake',
  'tween_camera'
])

type ContState = {
  created: Set<string>
  destroyed: Set<string>
  cameraOverridden: boolean
  playMusicSeen: boolean
}

export function checkContinuity(
  nodes: RuntimeNode[],
  edges: RuntimeEdge[],
  nodeMap: Map<string, RuntimeNode>,
  outEdges: Map<string, RuntimeEdge[]>,
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []

  const hasPathWithoutActor = new Map<string, Set<string>>()
  const hasPathWithDestroyedActor = new Map<string, Set<string>>()
  const unsafeWaitNodes = new Set<string>()
  const unsafeWaitEdges = new Set<string>()
  const musicActionWithoutMusicNodes = new Set<string>()
  let cameraOverriddenAtEnd = false
  const seenContinuityStates = new Set<string>()

  function contStateKey(nodeId: string, s: ContState): string {
    const c = Array.from(s.created).sort().join(',')
    const d = Array.from(s.destroyed).sort().join(',')
    return `${nodeId}|${c}|${d}|${s.cameraOverridden ? 1 : 0}|${s.playMusicSeen ? 1 : 0}`
  }

  function exploreBranchUntil(
    nodeId: string,
    stopId: string,
    state: ContState,
    pathVisited: Set<string>
  ): ContState[] {
    if (nodeId === stopId) {
      return [state]
    }
    if (pathVisited.has(nodeId)) {
      return []
    }
    const node = nodeMap.get(nodeId)
    if (!node) {
      return []
    }

    if (ACTOR_REF_TYPES.has(node.type)) {
      let target = String(node.params?.target ?? '').trim()
      if (node.type === 'attach_to_target' || node.type === 'detach') {
        target = String(node.params?.target_ref ?? '').trim()
      }
      if (node.type === 'tween') {
        const kind = String(node.params?.kind ?? 'instance').trim()
        if (kind === 'camera') target = ''
      }
      if (target && target !== 'player') {
        if (!state.created.has(target)) {
          const set = hasPathWithoutActor.get(nodeId) ?? new Set()
          set.add(target)
          hasPathWithoutActor.set(nodeId, set)
        }
        if (state.destroyed.has(target)) {
          const set = hasPathWithDestroyedActor.get(nodeId) ?? new Set()
          set.add(target)
          hasPathWithDestroyedActor.set(nodeId, set)
        }
      }
    }

    if (node.type === 'wait_until') {
      const timeout = node.params?.timeout_seconds
      if (typeof timeout !== 'number' || timeout <= 0) {
        unsafeWaitNodes.add(node.id)
      }
    }

    if (
      node.type === 'music_volume' ||
      node.type === 'music_duck' ||
      node.type === 'music_unduck' ||
      node.type === 'music_pitch' ||
      node.type === 'music_pause' ||
      node.type === 'music_resume' ||
      node.type === 'crossfade_music'
    ) {
      if (!state.playMusicSeen) {
        musicActionWithoutMusicNodes.add(node.id)
      }
    }

    let cam = state.cameraOverridden
    if (CAMERA_OVERRIDE_TYPES.has(node.type)) {
      cam = true
    } else if (node.type === 'camera_center') {
      cam = false
    } else if (node.type === 'tween_camera') {
      const returnToDefault = node.params?.return_to_default
      if (returnToDefault === true || returnToDefault === 'true') {
        cam = false
      } else {
        cam = true
      }
    }

    let playMusic = state.playMusicSeen
    if (
      node.type === 'play_music' ||
      node.type === 'play_boss_music' ||
      node.type === 'play_music_intro' ||
      node.type === 'play_music_intro_layered'
    ) {
      playMusic = true
    } else if (node.type === 'stop_music' || node.type === 'stop_boss_music') {
      playMusic = false
    }

    const newState: ContState = {
      created: new Set(state.created),
      destroyed: new Set(state.destroyed),
      cameraOverridden: cam,
      playMusicSeen: playMusic
    }

    if (node.type === 'actor_create') {
      const key = String(node.params?.actor_name ?? '').trim()
      if (key) newState.created.add(key)
    }
    if (node.type === 'spawn_entity') {
      const key = String(node.params?.key ?? '').trim()
      if (key) newState.created.add(key)
    }
    if (node.type === 'actor_destroy') {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player') newState.destroyed.add(target)
    }
    if (node.type === 'destroy_entity') {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player') newState.destroyed.add(target)
    }

    const outs = (outEdges.get(nodeId) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    const results: ContState[] = []
    const newPathVisited = new Set(pathVisited).add(nodeId)
    for (const edge of outs) {
      if (edge.conditionEnabled && edge.conditionIfFalse === 'wait_until_true') {
        const timeout = edge.endTimeoutSeconds
        if (typeof timeout !== 'number' || timeout <= 0) {
          unsafeWaitEdges.add(edge.id)
        }
      }
      results.push(...exploreBranchUntil(edge.target, stopId, newState, newPathVisited))
    }
    return results
  }

  function dfsContinuity(nodeId: string, state: ContState, pathVisited: Set<string>) {
    if (pathVisited.has(nodeId)) {
      return
    }
    const node = nodeMap.get(nodeId)
    if (!node) {
      return
    }

    const key = contStateKey(nodeId, state)
    if (seenContinuityStates.has(key)) {
      return
    }
    seenContinuityStates.add(key)

    if (ACTOR_REF_TYPES.has(node.type)) {
      let target = String(node.params?.target ?? '').trim()
      if (node.type === 'attach_to_target' || node.type === 'detach') {
        target = String(node.params?.target_ref ?? '').trim()
      }
      if (node.type === 'tween') {
        const kind = String(node.params?.kind ?? 'instance').trim()
        if (kind === 'camera') target = ''
      }
      if (target && target !== 'player') {
        if (!state.created.has(target)) {
          const set = hasPathWithoutActor.get(nodeId) ?? new Set()
          set.add(target)
          hasPathWithoutActor.set(nodeId, set)
        }
        if (state.destroyed.has(target)) {
          const set = hasPathWithDestroyedActor.get(nodeId) ?? new Set()
          set.add(target)
          hasPathWithDestroyedActor.set(nodeId, set)
        }
      }
    }

    if (node.type === 'wait_until') {
      const timeout = node.params?.timeout_seconds
      if (typeof timeout !== 'number' || timeout <= 0) {
        unsafeWaitNodes.add(node.id)
      }
    }

    if (
      node.type === 'music_volume' ||
      node.type === 'music_duck' ||
      node.type === 'music_unduck' ||
      node.type === 'music_pitch' ||
      node.type === 'music_pause' ||
      node.type === 'music_resume' ||
      node.type === 'crossfade_music'
    ) {
      if (!state.playMusicSeen) {
        musicActionWithoutMusicNodes.add(node.id)
      }
    }

    let cam = state.cameraOverridden
    if (CAMERA_OVERRIDE_TYPES.has(node.type)) {
      cam = true
    } else if (node.type === 'camera_center') {
      cam = false
    } else if (node.type === 'tween_camera') {
      const returnToDefault = node.params?.return_to_default
      if (returnToDefault === true || returnToDefault === 'true') {
        cam = false
      } else {
        cam = true
      }
    }

    let playMusic = state.playMusicSeen
    if (
      node.type === 'play_music' ||
      node.type === 'play_boss_music' ||
      node.type === 'play_music_intro' ||
      node.type === 'play_music_intro_layered'
    ) {
      playMusic = true
    } else if (node.type === 'stop_music' || node.type === 'stop_boss_music') {
      playMusic = false
    }

    const newState: ContState = {
      created: new Set(state.created),
      destroyed: new Set(state.destroyed),
      cameraOverridden: cam,
      playMusicSeen: playMusic
    }

    if (node.type === 'actor_create') {
      const key = String(node.params?.actor_name ?? '').trim()
      if (key) newState.created.add(key)
    }
    if (node.type === 'spawn_entity') {
      const key = String(node.params?.key ?? '').trim()
      if (key) newState.created.add(key)
    }
    if (node.type === 'actor_destroy') {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player') newState.destroyed.add(target)
    }
    if (node.type === 'destroy_entity') {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player') newState.destroyed.add(target)
    }

    if (node.type === 'end') {
      if (cam) cameraOverriddenAtEnd = true
      return
    }

    const outs = (outEdges.get(nodeId) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    if (node.type === 'parallel_start') {
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      if (joinId && nodeMap.has(joinId)) {
        const branchResults: ContState[] = []
        for (const edge of outs) {
          if (edge.sourceHandle?.startsWith('out_')) {
            branchResults.push(
              ...exploreBranchUntil(edge.target, joinId, newState, new Set(pathVisited).add(nodeId))
            )
          }
        }
        const merged: ContState = {
          created: new Set(),
          destroyed: new Set(),
          cameraOverridden: false,
          playMusicSeen: false
        }
        for (const r of branchResults) {
          r.created.forEach((a) => merged.created.add(a))
          r.destroyed.forEach((a) => merged.destroyed.add(a))
          if (r.cameraOverridden) merged.cameraOverridden = true
          if (r.playMusicSeen) merged.playMusicSeen = true
        }
        dfsContinuity(joinId, merged, new Set(pathVisited).add(nodeId))
      } else {
        const newPathVisited = new Set(pathVisited).add(nodeId)
        for (const edge of outs) {
          if (edge.conditionEnabled && edge.conditionIfFalse === 'wait_until_true') {
            const timeout = edge.endTimeoutSeconds
            if (typeof timeout !== 'number' || timeout <= 0) {
              unsafeWaitEdges.add(edge.id)
            }
          }
          dfsContinuity(edge.target, newState, newPathVisited)
        }
      }
    } else {
      const newPathVisited = new Set(pathVisited).add(nodeId)
      for (const edge of outs) {
        if (edge.conditionEnabled && edge.conditionIfFalse === 'wait_until_true') {
          const timeout = edge.endTimeoutSeconds
          if (typeof timeout !== 'number' || timeout <= 0) {
            unsafeWaitEdges.add(edge.id)
          }
        }
        dfsContinuity(edge.target, newState, newPathVisited)
      }
    }
  }

  const startNode = nodes.find((n) => n.type === 'start')
  if (startNode) {
    dfsContinuity(
      startNode.id,
      { created: new Set(), destroyed: new Set(), cameraOverridden: false, playMusicSeen: false },
      new Set()
    )
  }

  for (const [nodeId, actors] of hasPathWithoutActor.entries()) {
    for (const target of actors) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'actorUsedBeforeCreate',
        nodeId,
        message: t('validation.actorUsedBeforeCreate', { target })
      })
    }
  }

  for (const [nodeId, actors] of hasPathWithDestroyedActor.entries()) {
    for (const target of actors) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'actorUsedAfterDestroy',
        nodeId,
        message: t('validation.actorUsedAfterDestroy', { target })
      })
    }
  }

  for (const node of nodes) {
    if (node.type === 'follow_path') {
      const points = Array.isArray(node.params?.points) ? node.params.points : []
      if (points.length < 2) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'emptyPath',
          nodeId: node.id,
          message: t('validation.emptyPath')
        })
      }
    }
  }

  for (const nodeId of unsafeWaitNodes) {
    entries.push({
      severity: 'tip',
      defaultSeverity: 'tip',
      ruleId: 'unsafeWait',
      nodeId,
      message: t('validation.unsafeWait')
    })
  }

  for (const edgeId of unsafeWaitEdges) {
    const edge = edges.find((e) => e.id === edgeId)
    if (edge) {
      entries.push({
        severity: 'tip',
        defaultSeverity: 'tip',
        ruleId: 'unsafeWait',
        edgeId,
        message: t('validation.unsafeWait')
      })
    }
  }

  if (cameraOverriddenAtEnd) {
    entries.push({
      severity: 'tip',
      defaultSeverity: 'tip',
      ruleId: 'cameraOverrideNotReset',
      message: t('validation.cameraOverrideNotReset')
    })
  }

  for (const nodeId of musicActionWithoutMusicNodes) {
    entries.push({
      severity: 'tip',
      defaultSeverity: 'tip',
      ruleId: 'musicActionWithoutMusic',
      nodeId,
      message: t('validation.musicActionWithoutMusic')
    })
  }

  for (const node of nodes) {
    if (node.type === 'camera_track' || node.type === 'camera_track_until_stop') {
      const target = String(node.params?.target ?? '').trim()
      if (!target) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'cameraTrackMissingTarget',
          nodeId: node.id,
          message: t('validation.cameraTrackMissingTarget')
        })
      }
    }
  }

  return entries
}
