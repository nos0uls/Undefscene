import type { RuntimeNode, RuntimeEdge } from '../runtimeTypes'
import type { ValidationEntry } from './types'

export function checkParallelPairs(
  nodes: RuntimeNode[],
  nodeMap: Map<string, RuntimeNode>,
  inEdges: Map<string, RuntimeEdge[]>,
  outEdges: Map<string, RuntimeEdge[]>,
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []

  for (const node of nodes) {
    if (node.type === 'parallel_start') {
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      const branches = Array.isArray(node.params?.branches)
        ? (node.params?.branches as string[])
        : ['b0']
      if (!joinId) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'parallelStartMissingJoin',
          nodeId: node.id,
          message: t('validation.parallelStartMissingJoin', { id: node.id })
        })
      } else if (!nodeMap.has(joinId)) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'parallelStartJoinMissing',
          nodeId: node.id,
          message: t('validation.parallelStartJoinMissing', { id: node.id })
        })
      } else {
        const joinNode = nodeMap.get(joinId)
        if (joinNode?.type !== 'parallel_join') {
          entries.push({
            severity: 'error',
            defaultSeverity: 'error',
            ruleId: 'parallelStartJoinNotJoin',
            nodeId: node.id,
            message: t('validation.parallelStartJoinNotJoin', { id: node.id })
          })
        }

        const joinPairId =
          typeof joinNode?.params?.pairId === 'string' ? joinNode.params.pairId : ''
        if (joinPairId && joinPairId !== node.id) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinMismatchedPairId',
            nodeId: node.id,
            message: t('validation.parallelStartJoinMismatch', { id: node.id, joinId })
          })
        }

        const joinBranches = Array.isArray(joinNode?.params?.branches)
          ? (joinNode?.params?.branches as string[])
          : ['b0']
        const sameBranchCount = joinBranches.length === branches.length
        const sameBranchSet =
          sameBranchCount &&
          branches.every((branchId) => joinBranches.includes(branchId)) &&
          joinBranches.every((branchId) => branches.includes(branchId))

        if (!sameBranchSet) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartJoinBranchMismatch',
            nodeId: node.id,
            message: t('validation.parallelStartJoinBranchMismatch', { id: node.id, joinId })
          })
        }
      }

      const uniqueBranches = new Set(branches)
      if (uniqueBranches.size !== branches.length) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'parallelBranchDuplicate',
          nodeId: node.id,
          message: t('validation.parallelStartDuplicateBranchIds', { id: node.id })
        })
      }

      const outgoingEdges = outEdges.get(node.id) ?? []
      const outgoingHandleUsage = new Map<string, number>()

      for (const edge of outgoingEdges) {
        const handle = edge.sourceHandle
        if (!handle) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartMissingHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelStartEdgeNoSourceHandle', {
              id: node.id,
              edgeId: edge.id
            })
          })
          continue
        }

        if (!handle.startsWith('out_')) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartInvalidHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelStartEdgeUnexpectedHandle', {
              id: node.id,
              edgeId: edge.id,
              handle
            })
          })
          continue
        }

        outgoingHandleUsage.set(handle, (outgoingHandleUsage.get(handle) ?? 0) + 1)

        const branchId = handle.slice('out_'.length)
        if (!uniqueBranches.has(branchId)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartDisconnectedBranch',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelStartEdgeBranchNotListed', { id: node.id, branchId })
          })
        }
      }

      for (const [handle, count] of outgoingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartBranchMultipleEdges',
            nodeId: node.id,
            message: t('validation.parallelStartBranchMultipleEdges', {
              id: node.id,
              handle,
              count
            })
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = outgoingEdges.some((edge) => edge.sourceHandle === `out_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'tip',
            defaultSeverity: 'tip',
            ruleId: 'parallelStartBranchNotConnected',
            nodeId: node.id,
            message: t('validation.parallelStartBranchNoOutgoing', { id: node.id, branchId })
          })
        }
      }
    }

    if (node.type === 'parallel_join') {
      const pairId = typeof node.params?.pairId === 'string' ? node.params.pairId : ''
      const branches = Array.isArray(node.params?.branches)
        ? (node.params?.branches as string[])
        : ['b0']
      if (!pairId) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'parallelJoinMissingStart',
          nodeId: node.id,
          message: t('validation.parallelJoinNoPair', { id: node.id })
        })
      } else if (!nodeMap.has(pairId)) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'parallelJoinPairMissing',
          nodeId: node.id,
          message: t('validation.parallelJoinPairMissing', { id: node.id })
        })
      } else {
        const startNode = nodeMap.get(pairId)
        if (startNode?.type !== 'parallel_start') {
          entries.push({
            severity: 'error',
            defaultSeverity: 'error',
            ruleId: 'parallelJoinPairNotStart',
            nodeId: node.id,
            message: t('validation.parallelJoinPairNotStart', { id: node.id })
          })
        }

        const startJoinId =
          typeof startNode?.params?.joinId === 'string' ? startNode.params.joinId : ''
        if (startJoinId && startJoinId !== node.id) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinMismatchedPairId',
            nodeId: node.id,
            message: t('validation.parallelJoinPairMismatch', { id: node.id, pairId })
          })
        }

        const startBranches = Array.isArray(startNode?.params?.branches)
          ? (startNode?.params?.branches as string[])
          : ['b0']
        const sameBranchCount = startBranches.length === branches.length
        const sameBranchSet =
          sameBranchCount &&
          branches.every((branchId) => startBranches.includes(branchId)) &&
          startBranches.every((branchId) => branches.includes(branchId))

        if (!sameBranchSet) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinPairBranchMismatch',
            nodeId: node.id,
            message: t('validation.parallelJoinPairBranchMismatch', { id: node.id, pairId })
          })
        }
      }

      const uniqueBranches = new Set(branches)
      const incomingEdges = inEdges.get(node.id) ?? []
      const incomingHandleUsage = new Map<string, number>()

      for (const edge of incomingEdges) {
        const handle = edge.targetHandle
        if (!handle) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinEdgeNoTargetHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelJoinEdgeNoTargetHandle', {
              id: node.id,
              edgeId: edge.id
            })
          })
          continue
        }

        if (!handle.startsWith('in_')) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinEdgeUnexpectedHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelJoinEdgeUnexpectedHandle', {
              id: node.id,
              edgeId: edge.id,
              handle
            })
          })
          continue
        }

        incomingHandleUsage.set(handle, (incomingHandleUsage.get(handle) ?? 0) + 1)

        const branchId = handle.slice('in_'.length)
        if (!uniqueBranches.has(branchId)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinEdgeBranchNotListed',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelJoinEdgeBranchNotListed', {
              id: node.id,
              edgeId: edge.id,
              branchId
            })
          })
        }
      }

      for (const [handle, count] of incomingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinBranchMultipleEdges',
            nodeId: node.id,
            message: t('validation.parallelJoinBranchMultipleEdges', { id: node.id, handle, count })
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = incomingEdges.some((edge) => edge.targetHandle === `in_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'tip',
            defaultSeverity: 'tip',
            ruleId: 'parallelJoinBranchNoIncoming',
            nodeId: node.id,
            message: t('validation.parallelJoinBranchNoIncoming', { id: node.id, branchId })
          })
        }
      }
    }
  }

  return entries
}
