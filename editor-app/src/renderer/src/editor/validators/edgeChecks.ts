import type { RuntimeEdge, RuntimeNode } from '../runtimeTypes'
import type { ValidationEntry } from './types'

export function checkEdges(
  edges: RuntimeEdge[],
  nodes: RuntimeNode[],
  nodeMap: Map<string, RuntimeNode>,
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []

  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'edgeMissingSource',
        edgeId: edge.id,
        message: t('validation.edgeMissingSource', { edgeId: edge.id, source: edge.source })
      })
    }
    if (!nodeMap.has(edge.target)) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'edgeMissingTarget',
        edgeId: edge.id,
        message: t('validation.edgeMissingTarget', { edgeId: edge.id, target: edge.target })
      })
    }

    if (typeof edge.waitSeconds === 'number' && edge.waitSeconds < 0) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'edgeNegativeWait',
        edgeId: edge.id,
        message: t('validation.edgeNegativeWait', { edgeId: edge.id, count: edge.waitSeconds })
      })
    }

    if (edge.conditionEnabled) {
      const varName = String(edge.conditionVar ?? '').trim()
      const eq = String(edge.conditionEquals ?? '')

      if (!varName) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'edgeConditionVarEmpty',
          edgeId: edge.id,
          message: t('validation.edgeConditionVarEmpty', { edgeId: edge.id })
        })
      } else if (varName.startsWith('global.')) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'edgeConditionGlobalPrefix',
          edgeId: edge.id,
          message: t('validation.edgeConditionGlobalPrefix', { edgeId: edge.id })
        })
      }

      if (eq.trim().length === 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'edgeConditionEqualsEmpty',
          edgeId: edge.id,
          message: t('validation.edgeConditionEqualsEmpty', { edgeId: edge.id })
        })
      }

      if (edge.conditionIfFalse === 'wait_until_true') {
        const stopWhen = edge.stopWaitingWhen ?? 'none'

        if (stopWhen === 'global_var') {
          const endVar = String(edge.endConditionVar ?? '').trim()
          if (!endVar) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingEndVarEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingEndVarEmpty', { edgeId: edge.id })
            })
          } else if (endVar.startsWith('global.')) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingEndVarGlobalPrefix',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingEndVarGlobalPrefix', { edgeId: edge.id })
            })
          }
          if (String(edge.endConditionEquals ?? '').trim().length === 0) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingEndEqualsEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingEndEqualsEmpty', { edgeId: edge.id })
            })
          }
        }

        if (stopWhen === 'node_reached') {
          const nodeName = String(edge.endNodeName ?? '').trim()
          if (!nodeName) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingNodeNameEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingNodeNameEmpty', { edgeId: edge.id })
            })
          } else {
            const found = nodes.some((n) => String(n.name ?? '').trim() === nodeName)
            if (!found) {
              entries.push({
                severity: 'warn',
                defaultSeverity: 'warn',
                ruleId: 'edgeStopWaitingNodeNotFound',
                edgeId: edge.id,
                message: t('validation.edgeStopWaitingNodeNotFound', { edgeId: edge.id, nodeName })
              })
            }
          }
        }

        if (stopWhen === 'timeout') {
          const timeoutVal = edge.endTimeoutSeconds
          if (typeof timeoutVal !== 'number' || timeoutVal <= 0) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingTimeoutEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingTimeoutEmpty', { edgeId: edge.id })
            })
          }
        }
      }
    }
  }

  return entries
}
