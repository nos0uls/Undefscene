import { describe, test, expect } from 'vitest'
import { compileGraph, stripExport } from '../compiler'
import { reverseCompileCutscene } from '../reverseCompile'
import type { RuntimeState } from '../runtimeTypes'

function removeStartAndMarkNodes(actions: any[]): any[] {
  if (!Array.isArray(actions)) {
    return actions
  }
  return actions
    .filter((a) => a && a.type !== 'start' && a.type !== 'mark_node')
    .map((a) => {
      if (a.type === 'branch') {
        return {
          ...a,
          true_actions: removeStartAndMarkNodes(a.true_actions || []),
          false_actions: removeStartAndMarkNodes(a.false_actions || [])
        }
      }
      if (a.type === 'parallel') {
        return {
          ...a,
          actions: (a.actions || []).map((branch: any) => {
            const arr = Array.isArray(branch) ? branch : [branch]
            return removeStartAndMarkNodes(arr)
          })
        }
      }
      if (a.type === 'guard_global') {
        return {
          ...a,
          actions: removeStartAndMarkNodes(a.actions || [])
        }
      }
      return a
    })
}

describe('roundtrip tests', () => {
  test('compile -> export -> reverse compile -> compile yields same actions', () => {
    const originalState: RuntimeState = {
      schemaVersion: 1,
      title: 'Roundtrip Demo',
      nodes: [
        { id: 'start-id', type: 'start', name: 'Start' },
        { id: 'wait-id', type: 'wait', name: 'Wait 3s', params: { seconds: 3 } },
        {
          id: 'move-id',
          type: 'move',
          name: 'Move Character',
          params: { target: 'player', x: 100, y: 150, speed_px_sec: 60 }
        },
        { id: 'end-id', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'start-id', target: 'wait-id' },
        { id: 'e2', source: 'wait-id', target: 'move-id' },
        { id: 'e3', source: 'move-id', target: 'end-id' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    // 1. Compile original graph
    const compileResult1 = compileGraph(originalState)
    expect(compileResult1.ok).toBe(true)
    if (!compileResult1.ok) return

    // 2. Export to engine JSON
    const exportedJson = stripExport(originalState, compileResult1.actions)

    // 3. Reverse compile engine JSON back to editor graph state
    const reverseResult = reverseCompileCutscene(exportedJson)
    expect(reverseResult.ok).toBe(true)
    if (!reverseResult.ok) return

    // 4. Compile the reconstructed editor graph state
    const compileResult2 = compileGraph(reverseResult.state)
    expect(compileResult2.ok).toBe(true)
    if (!compileResult2.ok) return

    // 5. Assert that both compilation runs yielded the same actions list,
    // ignoring the start action and start marker discrepancies (as the reverse compiler
    // always creates a default start node and does not skip the start action in the actions list).
    const cleanActions1 = removeStartAndMarkNodes(compileResult1.actions)
    const cleanActions2 = removeStartAndMarkNodes(compileResult2.actions)
    expect(cleanActions2).toEqual(cleanActions1)
  })

  test('complex compile -> export -> reverse compile -> compile yields same actions (branch / parallel)', () => {
    const originalState: RuntimeState = {
      schemaVersion: 1,
      title: 'Complex Roundtrip Demo',
      nodes: [
        { id: 'start-id', type: 'start', name: 'Start' },
        { id: 'branch-id', type: 'branch', name: 'Check Item', params: { condition: 'has_key' } },
        { id: 'wait-true', type: 'wait', name: 'Wait True', params: { seconds: 1 } },
        { id: 'wait-false', type: 'wait', name: 'Wait False', params: { seconds: 3 } },
        {
          id: 'pstart-id',
          type: 'parallel_start',
          name: 'Parallel Start',
          params: { joinId: 'pjoin-id', branches: ['b0', 'b1'] }
        },
        { id: 'p1', type: 'wait', name: 'Wait B0', params: { seconds: 1 } },
        { id: 'p2', type: 'wait', name: 'Wait B1', params: { seconds: 2 } },
        {
          id: 'pjoin-id',
          type: 'parallel_join',
          name: 'Parallel Join',
          params: { pairId: 'pstart-id', branches: ['b0', 'b1'] }
        },
        { id: 'end-id', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'start-id', target: 'branch-id' },
        { id: 'e-true', source: 'branch-id', sourceHandle: 'out_true', target: 'wait-true' },
        { id: 'e-false', source: 'branch-id', sourceHandle: 'out_false', target: 'wait-false' },
        // both branches merge back to pstart-id
        { id: 'e-true-merge', source: 'wait-true', target: 'pstart-id' },
        { id: 'e-false-merge', source: 'wait-false', target: 'pstart-id' },
        // parallel flow
        { id: 'e-b0', source: 'pstart-id', sourceHandle: 'out_b0', target: 'p1' },
        { id: 'e-b1', source: 'pstart-id', sourceHandle: 'out_b1', target: 'p2' },
        { id: 'e-j0', source: 'p1', target: 'pjoin-id', targetHandle: 'in_b0' },
        { id: 'e-j1', source: 'p2', target: 'pjoin-id', targetHandle: 'in_b1' },
        { id: 'e-end', source: 'pjoin-id', target: 'end-id' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    // 1. Compile original graph
    const compileResult1 = compileGraph(originalState)
    expect(compileResult1.ok).toBe(true)
    if (!compileResult1.ok) return

    // 2. Export to engine JSON
    const exportedJson = stripExport(originalState, compileResult1.actions)

    // 3. Reverse compile engine JSON back to editor graph state
    const reverseResult = reverseCompileCutscene(exportedJson)
    expect(reverseResult.ok).toBe(true)
    if (!reverseResult.ok) return

    // 4. Compile the reconstructed editor graph state
    const compileResult2 = compileGraph(reverseResult.state)
    expect(compileResult2.ok).toBe(true)
    if (!compileResult2.ok) return

    // 5. Assert that both compilation runs yielded the same actions list,
    // ignoring the start action and start marker discrepancies.
    const cleanActions1 = removeStartAndMarkNodes(compileResult1.actions)
    const cleanActions2 = removeStartAndMarkNodes(compileResult2.actions)
    expect(cleanActions2).toEqual(cleanActions1)
  })
})
