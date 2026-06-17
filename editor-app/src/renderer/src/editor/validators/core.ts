import type { RuntimeState, RuntimeNode, RuntimeEdge } from '../runtimeTypes'
import { createTranslator } from '../../i18n/index'
import type { ValidationContext, ValidationEntry, ValidationResult } from './types'
import { checkNodeNames, checkStartEndPresence, checkReachability } from './graphChecks'
import { checkNodeParams } from './nodeChecks'
import { checkEdges } from './edgeChecks'
import { checkParallelPairs } from './parallelChecks'
import { checkContinuity } from './continuity'
import { checkResources } from './resourceChecks'

export function validateGraph(state: RuntimeState, context?: ValidationContext): ValidationResult {
  const entries: ValidationEntry[] = []
  const { nodes, edges } = state

  // Создаём локализатор на основе языка из контекста (по умолчанию en).
  const t = createTranslator(context?.language ?? 'en')

  // --- 0. Maps & Sets for global lookups ---
  const nodeMap = new Map<string, RuntimeNode>()
  const actorKeys = new Set<string>()
  const markNodeNames = new Map<string, string[]>()
  
  for (const n of nodes) {
    nodeMap.set(n.id, n)
    if (n.type === 'actor_create') {
      const key = String(n.params?.actor_name ?? '').trim()
      if (key) actorKeys.add(key)
    }
    if (n.type === 'spawn_entity') {
      const key = String(n.params?.key ?? '').trim()
      if (key) actorKeys.add(key)
    }
    if (n.type === 'mark_node') {
      const name = String(n.params?.name ?? '').trim()
      if (name) {
        const list = markNodeNames.get(name) ?? []
        list.push(n.id)
        markNodeNames.set(name, list)
      }
    }
  }

  // Входящие и исходящие рёбра для каждой ноды (без internal __pair рёбер).
  const inEdges = new Map<string, RuntimeEdge[]>()
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    const isPair = e.sourceHandle === '__pair' && e.targetHandle === '__pair'
    if (!isPair) {
      inEdges.set(e.target, [...(inEdges.get(e.target) ?? []), e])
      outEdges.set(e.source, [...(outEdges.get(e.source) ?? []), e])
    }
  }

  // --- 1. Run all checks ---
  
  // 1a. Node Names
  entries.push(...checkNodeNames(nodes, t))

  // 1b. Mark Node duplicates
  for (const [name, ids] of markNodeNames.entries()) {
    if (ids.length <= 1) continue
    for (const id of ids) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'duplicateMarkerName',
        nodeId: id,
        message: t('validation.duplicateMarkerName', { name, count: ids.length })
      })
    }
  }

  // 1c. Start/End node count checks
  entries.push(...checkStartEndPresence(nodes, t))

  // 1d. Node parameters and types validation
  entries.push(...checkNodeParams(nodes, outEdges, actorKeys, markNodeNames, t))

  // 1e. Parallel start/join pairing
  entries.push(...checkParallelPairs(nodes, nodeMap, inEdges, outEdges, t))

  // 1f. Edge source/target existence & weights
  entries.push(...checkEdges(edges, nodes, nodeMap, t))

  // 1g. Reachability BFS checker
  entries.push(...checkReachability(nodes, outEdges, t))

  // 1h. Continuity execution-path checker
  entries.push(...checkContinuity(nodes, edges, nodeMap, outEdges, t))

  // 1i. Resource context validation (if context is present)
  if (context) {
    entries.push(...checkResources(nodes, context, t))
  }

  // 1j. Global State / Uniqueness checks
  
  // checkpoint_id uniqueness: multiple checkpoint_state with same ID.
  const checkpointIds = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.type === 'checkpoint_state') {
      const cid = String(node.params?.checkpoint_id ?? '').trim()
      if (cid) {
        const list = checkpointIds.get(cid) ?? []
        list.push(node.id)
        checkpointIds.set(cid, list)
      }
    }
  }
  for (const [cid, ids] of checkpointIds.entries()) {
    if (ids.length > 1) {
      for (const id of ids) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'duplicateCheckpointId',
          nodeId: id,
          message: t('validation.duplicateCheckpointId', { cid })
        })
      }
    }
  }

  // restore_state must reference an existing checkpoint_id.
  for (const node of nodes) {
    if (node.type === 'restore_state') {
      const cid = String(node.params?.checkpoint_id ?? '').trim()
      if (cid && !checkpointIds.has(cid)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'restoreCheckpointNotFound',
          nodeId: node.id,
          message: t('validation.restoreCheckpointNotFound', { cid })
        })
      }
    }
  }

  // actor_created_twice: multiple actor_create with same actor_name.
  const actorCreateNames = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.type === 'actor_create') {
      const key = String(node.params?.actor_name ?? '').trim()
      if (key) {
        const list = actorCreateNames.get(key) ?? []
        list.push(node.id)
        actorCreateNames.set(key, list)
      }
    }
  }
  for (const [key, ids] of actorCreateNames.entries()) {
    if (ids.length > 1) {
      for (const id of ids) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'actorCreatedTwice',
          nodeId: id,
          message: t('validation.actorCreatedTwice', { key, count: ids.length })
        })
      }
    }
  }

  // actor_destroyed_not_created: actor_destroy on an actor never created in graph.
  for (const node of nodes) {
    if (node.type === 'actor_destroy') {
      const target = String(node.params?.target ?? '').trim()
      if (
        target &&
        target !== 'player' &&
        !actorCreateNames.has(target) &&
        !actorKeys.has(target)
      ) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'actorDestroyedNotCreated',
          nodeId: node.id,
          message: t('validation.actorDestroyedNotCreated', { target })
        })
      }
    }
  }

  // music_not_stopped: play_music without corresponding stop_music anywhere in graph.
  const hasPlayMusic = nodes.some((n) => n.type === 'play_music')
  const hasStopMusic = nodes.some((n) => n.type === 'stop_music')
  const hasPlayBossMusic = nodes.some((n) => n.type === 'play_boss_music')
  const hasStopBossMusic = nodes.some((n) => n.type === 'stop_boss_music')
  if ((hasPlayMusic && !hasStopMusic) || (hasPlayBossMusic && !hasStopBossMusic)) {
    entries.push({
      severity: 'tip',
      defaultSeverity: 'tip',
      ruleId: 'musicNotStopped',
      message: t('validation.musicNotStopped')
    })
  }

  return {
    entries,
    hasErrors: entries.some((e) => e.severity === 'error')
  }
}
