import type { RuntimeNode, RuntimeEdge } from '../runtimeTypes'
import type { ValidationEntry } from './types'

export function checkNodeNames(
  nodes: RuntimeNode[],
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []
  const nameToNodeIds = new Map<string, string[]>()

  for (const n of nodes) {
    const name = String(n.name ?? '').trim()
    if (!name) {
      entries.push({
        severity: 'tip',
        defaultSeverity: 'tip',
        ruleId: 'nodeNoName',
        nodeId: n.id,
        message: t('validation.nodeNoName', { id: n.id, type: n.type })
      })
      continue
    }
    const list = nameToNodeIds.get(name) ?? []
    list.push(n.id)
    nameToNodeIds.set(name, list)
  }

  for (const [name, ids] of nameToNodeIds.entries()) {
    if (ids.length <= 1) continue
    for (const id of ids) {
      entries.push({
        severity: 'tip',
        defaultSeverity: 'tip',
        ruleId: 'duplicateName',
        nodeId: id,
        message: t('validation.duplicateName', { name, count: ids.length })
      })
    }
  }

  return entries
}

export function checkStartEndPresence(
  nodes: RuntimeNode[],
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')

  if (startNodes.length === 0) {
    entries.push({
      severity: 'error',
      defaultSeverity: 'error',
      ruleId: 'missingStartNode',
      message: t('validation.missingStartNode')
    })
  }
  if (startNodes.length > 1) {
    entries.push({
      severity: 'error',
      defaultSeverity: 'error',
      ruleId: 'tooManyStartNodes',
      message: t('validation.tooManyStartNodes', { count: startNodes.length - 1 })
    })
  }
  if (endNodes.length === 0) {
    entries.push({
      severity: 'error',
      defaultSeverity: 'error',
      ruleId: 'missingEndNode',
      message: t('validation.missingEndNode')
    })
  }

  return entries
}

export function checkReachability(
  nodes: RuntimeNode[],
  outEdges: Map<string, RuntimeEdge[]>,
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')

  if (startNodes.length === 1) {
    const reachable = new Set<string>()
    const queue = [startNodes[0].id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)

      const outs = outEdges.get(current) ?? []
      for (const e of outs) {
        if (!reachable.has(e.target)) queue.push(e.target)
      }
    }

    const unreachableNodes = nodes.filter((n) => !reachable.has(n.id))
    if (unreachableNodes.length > 0) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'unreachableNodes',
        message: t('validation.unreachableNodes', { count: unreachableNodes.length })
      })
    }

    const reachableEnd = endNodes.some((n) => reachable.has(n.id))
    if (!reachableEnd && endNodes.length > 0) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'noEndNodeReachable',
        message: t('validation.noEndNodeReachable')
      })
    }
  }

  return entries
}
