// validateGraph.ts — Валидация графа перед экспортом.
// Проверяет структуру графа: связность, обязательные поля, висящие ноды и т.д.
// Возвращает массив предупреждений/ошибок, которые показываются в панели Logs.

import type { RuntimeState, RuntimeNode, RuntimeEdge } from './runtimeTypes'

// Уровень серьёзности: error блокирует экспорт, warn — нет.
export type ValidationSeverity = 'error' | 'warn'

// Одна запись валидации.
export type ValidationEntry = {
  severity: ValidationSeverity
  // ID ноды или ребра, к которому относится проблема (может быть null для глобальных).
  nodeId?: string
  edgeId?: string
  message: string
}

// Результат валидации: массив записей.
export type ValidationResult = {
  entries: ValidationEntry[]
  // Есть ли хотя бы одна ошибка (блокирующая экспорт)?
  hasErrors: boolean
}

// Какие параметры обязательны для каждого типа ноды.
// Ключ — тип ноды, значение — массив имён обязательных параметров.
const REQUIRED_PARAMS: Record<string, string[]> = {
  dialogue: [],
  move: ['target'],
  set_position: ['target'],
  actor_create: ['sprite_or_object'],
  actor_destroy: ['target'],
  animate: ['target'],
  camera_track: ['target'],
  camera_pan: ['x', 'y'],
  set_depth: ['target'],
  set_facing: ['target'],
  branch: ['condition'],
  run_function: ['function_name'],
  follow_path: ['target']
}

// Главная функция валидации. Принимает текущее состояние графа.
export function validateGraph(state: RuntimeState): ValidationResult {
  const entries: ValidationEntry[] = []
  const { nodes, edges } = state

  // --- 1. Проверяем наличие start и end нод ---
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')

  if (startNodes.length === 0) {
    entries.push({ severity: 'error', message: 'Graph has no "start" node.' })
  }
  if (startNodes.length > 1) {
    entries.push({ severity: 'error', message: `Graph has ${startNodes.length} "start" nodes — only 1 is allowed.` })
  }
  if (endNodes.length === 0) {
    entries.push({ severity: 'error', message: 'Graph has no "end" node.' })
  }

  // --- 2. Карты для быстрого доступа ---
  const nodeMap = new Map<string, RuntimeNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Входящие и исходящие рёбра для каждой ноды.
  const inEdges = new Map<string, RuntimeEdge[]>()
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    inEdges.set(e.target, [...(inEdges.get(e.target) ?? []), e])
    outEdges.set(e.source, [...(outEdges.get(e.source) ?? []), e])
  }

  // --- 3. Проверяем каждую ноду ---
  for (const node of nodes) {
    const incoming = (inEdges.get(node.id) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )
    const outgoing = (outEdges.get(node.id) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    // start не должен иметь входящих рёбер.
    if (node.type === 'start' && incoming.length > 0) {
      entries.push({
        severity: 'warn',
        nodeId: node.id,
        message: `"start" node "${node.id}" has ${incoming.length} incoming edge(s) — start should have none.`
      })
    }

    // start должен иметь хотя бы один выход.
    if (node.type === 'start' && outgoing.length === 0) {
      entries.push({
        severity: 'error',
        nodeId: node.id,
        message: `"start" node "${node.id}" has no outgoing edges — graph cannot proceed.`
      })
    }

    // end не должен иметь исходящих рёбер.
    if (node.type === 'end' && outgoing.length > 0) {
      entries.push({
        severity: 'warn',
        nodeId: node.id,
        message: `"end" node "${node.id}" has ${outgoing.length} outgoing edge(s) — end should have none.`
      })
    }

    // Висящая нода: нет ни входящих, ни исходящих (кроме start/end).
    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
      if (incoming.length === 0 && outgoing.length === 0) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (${node.type}) is disconnected — no edges at all.`
        })
      } else if (incoming.length === 0 && node.type !== 'parallel_start') {
        // Нода без входящих — до неё нельзя добраться от start.
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (${node.type}) has no incoming edges — unreachable from start.`
        })
      }
    }

    // Обычная нода (не branch, не parallel_start) не должна иметь > 1 исходящего ребра.
    if (
      node.type !== 'start' &&
      node.type !== 'end' &&
      node.type !== 'branch' &&
      node.type !== 'parallel_start' &&
      node.type !== 'parallel_join' &&
      outgoing.length > 1
    ) {
      entries.push({
        severity: 'warn',
        nodeId: node.id,
        message: `Node "${node.id}" (${node.type}) has ${outgoing.length} outgoing edges — only 1 expected.`
      })
    }

    // --- 4. Проверяем обязательные параметры ---
    const requiredFields = REQUIRED_PARAMS[node.type]
    if (requiredFields) {
      for (const field of requiredFields) {
        const value = node.params?.[field]
        if (value === undefined || value === null || value === '') {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `Node "${node.id}" (${node.type}): required field "${field}" is empty.`
          })
        }
      }
    }

    // --- 5. Проверяем parallel_start ↔ parallel_join пару ---
    if (node.type === 'parallel_start') {
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      if (!joinId) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_start "${node.id}" has no joinId — missing parallel_join pair.`
        })
      } else if (!nodeMap.has(joinId)) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_start "${node.id}" references joinId "${joinId}" which does not exist.`
        })
      }
    }

    if (node.type === 'parallel_join') {
      const pairId = typeof node.params?.pairId === 'string' ? node.params.pairId : ''
      if (!pairId) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `parallel_join "${node.id}" has no pairId — orphaned join node.`
        })
      } else if (!nodeMap.has(pairId)) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_join "${node.id}" references pairId "${pairId}" which does not exist.`
        })
      }
    }
  }

  // --- 6. Проверяем рёбра: source и target должны существовать ---
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      entries.push({
        severity: 'error',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references source "${edge.source}" which does not exist.`
      })
    }
    if (!nodeMap.has(edge.target)) {
      entries.push({
        severity: 'error',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references target "${edge.target}" which does not exist.`
      })
    }

    // Отрицательный wait — ошибка.
    if (typeof edge.waitSeconds === 'number' && edge.waitSeconds < 0) {
      entries.push({
        severity: 'warn',
        edgeId: edge.id,
        message: `Edge "${edge.id}" has negative waitSeconds (${edge.waitSeconds}).`
      })
    }
  }

  // --- 7. Проверяем достижимость от start (BFS) ---
  if (startNodes.length === 1) {
    const reachable = new Set<string>()
    const queue = [startNodes[0].id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)

      // Идём по исходящим рёбрам (включая __pair для parallel).
      const outs = outEdges.get(current) ?? []
      for (const e of outs) {
        if (!reachable.has(e.target)) queue.push(e.target)
      }
    }

    // Ноды, до которых нельзя добраться от start.
    const unreachableNodes = nodes.filter((n) => !reachable.has(n.id))
    if (unreachableNodes.length > 0) {
      entries.push({
        severity: 'warn',
        message: `${unreachableNodes.length} node(s) unreachable from start: ${unreachableNodes.map((n) => `"${n.id}"`).join(', ')}.`
      })
    }

    // Проверяем, что хотя бы одна end-нода достижима.
    const reachableEnd = endNodes.some((n) => reachable.has(n.id))
    if (!reachableEnd && endNodes.length > 0) {
      entries.push({
        severity: 'error',
        message: 'No "end" node is reachable from "start" — graph has no valid path to completion.'
      })
    }
  }

  return {
    entries,
    hasErrors: entries.some((e) => e.severity === 'error')
  }
}
