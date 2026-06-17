import type { RuntimeEdge, RuntimeNode, RuntimeState } from '../runtimeTypes'
import type { Translator, CompiledAction, CompileResult } from './types'
import { filterRegularEdges, getNormalizedNodeName, compileBaseNode } from './utils'
import * as compilers from './compilers'

const COMPILERS: Record<string, (node: RuntimeNode) => CompiledAction> = {
  // movement
  move_relative: compilers.compileMoveRelative,
  set_position_relative: compilers.compileSetPositionRelative,
  jump: compilers.compileJump,
  follow_path: compilers.compileFollowPath,

  // dialogue
  set_dialogue_speed: compilers.compileSetDialogueSpeed,
  wait_typing: compilers.compileWaitTyping,
  dialogue_control: compilers.compileDialogueControl,
  set_portrait_next: compilers.compileSetPortraitNext,
  set_portrait_now: compilers.compileSetPortraitNow,
  clear_dialogue: compilers.compileClearDialogue,

  // camera
  camera_shake: compilers.compileCameraShake,
  tween_camera: compilers.compileTweenCamera,

  // audio
  play_music: compilers.compilePlayMusic,
  stop_music: compilers.compileStopMusic,
  music_volume: compilers.compileMusicVolume,
  music_duck: compilers.compileMusicDuck,
  music_unduck: compilers.compileMusicUnduck,
  music_pitch: compilers.compileMusicPitch,
  music_pause: compilers.compileMusicPause,
  music_resume: compilers.compileMusicResume,
  play_boss_music: compilers.compilePlayBossMusic,
  stop_boss_music: compilers.compileStopBossMusic,
  boss_music_phase: compilers.compileBossMusicPhase,
  play_music_intro: compilers.compilePlayMusicIntro,
  play_music_intro_layered: compilers.compilePlayMusicIntroLayered,
  crossfade_music: compilers.compileCrossfadeMusic,

  // visual
  shake_object: compilers.compileShakeObject,
  emote: compilers.compileEmote,
  flip: compilers.compileFlip,
  spin: compilers.compileSpin,
  set_visible: compilers.compileSetVisible,

  // logic / control
  wait_until: compilers.compileWaitUntil,
  run_function: compilers.compileRunFunction,
  set_property: compilers.compileSetProperty,
  partial_control: compilers.compilePartialControl,
  schedule_action: compilers.compileScheduleAction,
  tween: compilers.compileTween,
  detach: compilers.compileDetach,
  wait_for_interact: compilers.compileWaitForInteract,
  halt: compilers.compileHalt,
  checkpoint_state: compilers.compileCheckpointState,
  restore_state: compilers.compileRestoreState,
  set_flag: compilers.compileSetFlag,
  spawn_entity: compilers.compileSpawnEntity,
  destroy_entity: compilers.compileDestroyEntity,
  set_plot: compilers.compileSetPlot
}

function nodeToAction(node: RuntimeNode): CompiledAction {
  const strategy = COMPILERS[node.type]
  if (strategy) {
    return strategy(node)
  }
  return compileBaseNode(node)
}

export function compileGraph(state: RuntimeState, t?: Translator): CompileResult {
  // Если translator не передан — fallback на оригинальный английский текст.
  const _t: Translator =
    t ??
    ((key, fallbackOrParams, _maybeFallback) =>
      typeof fallbackOrParams === 'string' ? fallbackOrParams : key)
  const { nodes, edges } = state

  // Ищем стартовую ноду.
  const startNode = nodes.find((n) => n.type === 'start')
  if (!startNode) {
    return {
      ok: false,
      error: _t('compileGraph.noStartNode', 'No "start" node found in the graph.')
    }
  }

  // Проверяем, что есть хотя бы одна end-нода.
  const hasEnd = nodes.some((n) => n.type === 'end')
  if (!hasEnd) {
    return { ok: false, error: _t('compileGraph.noEndNode', 'No "end" node found in the graph.') }
  }

  // Карта нод по ID для быстрого доступа.
  const nodeMap = new Map<string, RuntimeNode>()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
  }

  // Карта исходящих рёбер: nodeId → список рёбер.
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    let list = outEdges.get(e.source)
    if (!list) {
      list = []
      outEdges.set(e.source, list)
    }
    list.push(e)
  }

  // Множество нод в текущем стеке рекурсии для поиска циклов.
  const visiting = new Set<string>()

  // Cache for normalized node names to avoid duplicate computations
  const nodeNameCache = new Map<string, string>()

  // Function to get normalized node name with caching
  function getCachedNormalizedNodeName(node: RuntimeNode): string {
    if (nodeNameCache.has(node.id)) {
      return nodeNameCache.get(node.id)!
    }
    const name = getNormalizedNodeName(node)
    nodeNameCache.set(node.id, name)
    return name
  }

  // Создаём action-обёртку, которая запускает вложенные actions только если условие true.
  function wrapWithEdgeCondition(edge: RuntimeEdge, inner: CompiledAction[]): CompiledAction[] {
    if (!edge.conditionEnabled) return inner

    const rawVar = String(edge.conditionVar ?? '').trim()
    const equals = String(edge.conditionEquals ?? '')

    if (!rawVar) return inner

    const varName = rawVar.startsWith('global.') ? rawVar.slice('global.'.length) : rawVar
    const ifFalse = edge.conditionIfFalse ?? 'skip'

    const guard: CompiledAction = {
      type: 'guard_global',
      var: varName,
      equals,
      if_false: ifFalse,
      actions: inner
    }

    if (ifFalse === 'wait_until_true') {
      const stopWhen = edge.stopWaitingWhen ?? 'none'
      guard.stop_when = stopWhen

      if (stopWhen === 'global_var') {
        const endVar = String(edge.endConditionVar ?? '').trim()
        const endVarClean = endVar.startsWith('global.') ? endVar.slice('global.'.length) : endVar
        if (endVarClean) {
          guard.end_var = endVarClean
          guard.end_equals = String(edge.endConditionEquals ?? '')
        }
      } else if (stopWhen === 'node_reached') {
        const nodeName = String(edge.endNodeName ?? '').trim()
        if (nodeName) {
          guard.end_node = nodeName
        }
      } else if (stopWhen === 'timeout') {
        if (typeof edge.endTimeoutSeconds === 'number' && edge.endTimeoutSeconds > 0) {
          guard.end_timeout = edge.endTimeoutSeconds
        }
      }
    }

    return [guard]
  }

  // Рекурсивный обход: собираем actions начиная с nodeId.
  function walkFrom(nodeId: string): CompileResult {
    if (visiting.has(nodeId)) {
      return {
        ok: false,
        error: _t(
          'compileGraph.cycleDetected',
          { nodeId },
          'Cycle detected at node "{nodeId}". Cycles are not allowed.'
        )
      }
    }
    visiting.add(nodeId)

    const result = ((): CompileResult => {
      const node = nodeMap.get(nodeId)
      if (!node) {
        return {
          ok: false,
          error: _t('compileGraph.nodeNotFound', { nodeId }, 'Node "{nodeId}" not found.')
        }
      }

      const actions: CompiledAction[] = []

      if (node.type !== 'parallel_join') {
        const nodeName = getCachedNormalizedNodeName(node)
        if (nodeName) {
          actions.push({ type: 'mark_node', name: nodeName })
        }
      }

      if (node.type === 'start' || node.type === 'end') {
        if (node.type === 'start') {
          actions.push(nodeToAction(node))
          const next = getNextActions(nodeId)
          if (!next.ok) return next
          actions.push(...next.actions)
        }
        return { ok: true, actions }
      }

      if (node.type === 'parallel_start') {
        const result = compileParallel(node)
        if (!result.ok) return result
        actions.push(...result.actions)

        const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
        if (joinId) {
          const afterJoin = getNextActions(joinId)
          if (!afterJoin.ok) return afterJoin
          actions.push(...afterJoin.actions)
        }

        return { ok: true, actions }
      }

      if (node.type === 'parallel_join') {
        return { ok: true, actions: [] }
      }

      if (node.type === 'branch') {
        const result = compileBranch(node)
        if (!result.ok) return result
        actions.push(...result.actions)
        return { ok: true, actions }
      }

      const action = nodeToAction(node)
      actions.push(action)

      const next = getNextActions(nodeId)
      if (!next.ok) return next
      actions.push(...next.actions)

      return { ok: true, actions }
    })()

    visiting.delete(nodeId)
    return result
  }

  function getNextActions(nodeId: string): CompileResult {
    const outs = outEdges.get(nodeId) ?? []
    const regularOuts = filterRegularEdges(outs)

    if (regularOuts.length === 0) {
      return { ok: true, actions: [] }
    }

    if (regularOuts.length === 1) {
      const edge = regularOuts[0]
      const actions: CompiledAction[] = []

      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: edge.waitSeconds }
        actions.push(...wrapWithEdgeCondition(edge, [waitAction]))
      }

      const next = walkFrom(edge.target)
      if (!next.ok) return next
      actions.push(...next.actions)
      return { ok: true, actions }
    }

    return {
      ok: false,
      error: _t(
        'compileGraph.tooManyOutputs',
        { nodeId, count: regularOuts.length },
        'Node "{nodeId}" has {count} outgoing edges. Only parallel_start and branch can have multiple outputs.'
      )
    }
  }

  function compileParallel(startNode: RuntimeNode): CompileResult {
    const joinId = typeof startNode.params?.joinId === 'string' ? startNode.params.joinId : ''
    const branches = Array.isArray(startNode.params?.branches)
      ? (startNode.params.branches as string[])
      : ['b0']

    const outs = filterRegularEdges(outEdges.get(startNode.id) ?? [])
    const parallelBranches: Array<CompiledAction | CompiledAction[]> = []

    for (const branchId of branches) {
      const expectedSourceHandle = `out_${branchId}`
      const edge = outs.find((e) => e.sourceHandle === expectedSourceHandle)
      if (!edge) {
        continue
      }

      const branchResult = walkBranchUntil(edge.target, joinId)
      if (!branchResult.ok) return branchResult

      const seq: CompiledAction[] = []
      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: edge.waitSeconds }
        seq.push(...wrapWithEdgeCondition(edge, [waitAction]))
      }

      seq.push(...branchResult.actions)

      const shouldGateWholeBranch =
        edge.conditionEnabled && !(typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0)

      if (seq.length === 0) {
        continue
      }

      if (shouldGateWholeBranch) {
        parallelBranches.push(...wrapWithEdgeCondition(edge, seq))
        continue
      }

      if (seq.length === 1) {
        parallelBranches.push(seq[0])
      } else {
        parallelBranches.push(seq)
      }
    }

    const parallelAction: CompiledAction = {
      type: 'parallel',
      actions: parallelBranches
    }

    return { ok: true, actions: [parallelAction] }
  }

  function walkBranchUntil(nodeId: string, stopNodeId: string): CompileResult {
    if (nodeId === stopNodeId) {
      return { ok: true, actions: [] }
    }

    if (visiting.has(nodeId)) {
      return {
        ok: false,
        error: _t(
          'compileGraph.cycleInParallel',
          { nodeId },
          'Cycle detected at node "{nodeId}" inside parallel branch.'
        )
      }
    }
    visiting.add(nodeId)

    const result = ((): CompileResult => {
      const node = nodeMap.get(nodeId)
      if (!node) {
        return {
          ok: false,
          error: _t(
            'compileGraph.nodeNotFoundInParallel',
            { nodeId },
            'Node "{nodeId}" not found in parallel branch.'
          )
        }
      }

      const actions: CompiledAction[] = []

      if (node.type !== 'parallel_join') {
        const nodeName = getCachedNormalizedNodeName(node)
        if (nodeName) {
          actions.push({ type: 'mark_node', name: nodeName })
        }
      }

      if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
        actions.push(nodeToAction(node))
      }

      const outs = filterRegularEdges(outEdges.get(nodeId) ?? [])

      if (outs.length === 0) {
        return {
          ok: false,
          error: _t(
            'compileGraph.parallelDeadEnd',
            { nodeId, stopNodeId },
            'Parallel branch reached dead-end at node "{nodeId}" before join "{stopNodeId}".'
          )
        }
      }

      if (outs.length > 1) {
        return {
          ok: false,
          error: _t(
            'compileGraph.parallelSplit',
            { nodeId, count: outs.length },
            'Parallel branch has a split at node "{nodeId}" ({count} outgoing edges). Branches must be linear.'
          )
        }
      }

      const edge = outs[0]
      const edgeActions: CompiledAction[] = []

      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: edge.waitSeconds }
        edgeActions.push(...wrapWithEdgeCondition(edge, [waitAction]))
      }

      const next = walkBranchUntil(edge.target, stopNodeId)
      if (!next.ok) return next

      const shouldGateRemainingBranch =
        edge.conditionEnabled && !(typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0)

      if (shouldGateRemainingBranch) {
        if (next.actions.length > 0) {
          edgeActions.push(...wrapWithEdgeCondition(edge, next.actions))
        }
      } else {
        edgeActions.push(...next.actions)
      }

      actions.push(...edgeActions)

      return { ok: true, actions }
    })()

    visiting.delete(nodeId)
    return result
  }

  function compileBranch(node: RuntimeNode): CompileResult {
    const condition = typeof node.params?.condition === 'string' ? node.params.condition : ''
    const outs = filterRegularEdges(outEdges.get(node.id) ?? [])

    const trueEdge = outs.find((e) => e.sourceHandle === 'out_true') ?? outs[0]
    const falseEdge = outs.find((e) => e.sourceHandle === 'out_false') ?? outs[1]

    const trueActions: CompiledAction[] = []
    const falseActions: CompiledAction[] = []

    if (trueEdge) {
      const edgeActions: CompiledAction[] = []

      if (typeof trueEdge.waitSeconds === 'number' && trueEdge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: trueEdge.waitSeconds }
        edgeActions.push(...wrapWithEdgeCondition(trueEdge, [waitAction]))
      }

      const result = walkFrom(trueEdge.target)
      if (!result.ok) return result

      const shouldGateWholeTrueBranch =
        trueEdge.conditionEnabled &&
        !(typeof trueEdge.waitSeconds === 'number' && trueEdge.waitSeconds > 0)

      if (shouldGateWholeTrueBranch) {
        if (result.actions.length > 0) {
          edgeActions.push(...wrapWithEdgeCondition(trueEdge, result.actions))
        }
      } else {
        edgeActions.push(...result.actions)
      }

      trueActions.push(...edgeActions)
    }

    if (falseEdge) {
      const edgeActions: CompiledAction[] = []

      if (typeof falseEdge.waitSeconds === 'number' && falseEdge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: falseEdge.waitSeconds }
        edgeActions.push(...wrapWithEdgeCondition(falseEdge, [waitAction]))
      }

      const result = walkFrom(falseEdge.target)
      if (!result.ok) return result

      const shouldGateWholeFalseBranch =
        falseEdge.conditionEnabled &&
        !(typeof falseEdge.waitSeconds === 'number' && falseEdge.waitSeconds > 0)

      if (shouldGateWholeFalseBranch) {
        if (result.actions.length > 0) {
          edgeActions.push(...wrapWithEdgeCondition(falseEdge, result.actions))
        }
      } else {
        edgeActions.push(...result.actions)
      }

      falseActions.push(...edgeActions)
    }

    const branchAction: CompiledAction = {
      type: 'branch',
      condition,
      true_actions: trueActions,
      false_actions: falseActions
    }

    return { ok: true, actions: [branchAction] }
  }

  return walkFrom(startNode.id)
}
