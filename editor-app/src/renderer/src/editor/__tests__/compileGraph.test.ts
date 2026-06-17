import { describe, test, expect } from 'vitest'
import { compileGraph } from '../compiler'
import type { RuntimeState } from '../runtimeTypes'

describe('compileGraph', () => {
  test('linear scene start -> wait -> end', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Linear Scene',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        { id: 'n-wait', type: 'wait', name: 'Wait 2s', params: { seconds: 2 } },
        { id: 'n-end', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'n-start', target: 'n-wait' },
        { id: 'e2', source: 'n-wait', target: 'n-end' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = compileGraph(state)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.actions).toEqual([
        { type: 'mark_node', name: 'Start' },
        { type: 'start' },
        { type: 'mark_node', name: 'Wait 2s' },
        { type: 'wait', seconds: 2 },
        { type: 'mark_node', name: 'End' }
      ])
    }
  })

  test('branch compilation', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Branch Scene',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        { id: 'n-branch', type: 'branch', name: 'Check Item', params: { condition: 'has_key' } },
        { id: 'n-wait-true', type: 'wait', name: 'Wait True', params: { seconds: 1 } },
        { id: 'n-wait-false', type: 'wait', name: 'Wait False', params: { seconds: 3 } },
        { id: 'n-end-true', type: 'end', name: 'End True' },
        { id: 'n-end-false', type: 'end', name: 'End False' }
      ],
      edges: [
        { id: 'e1', source: 'n-start', target: 'n-branch' },
        { id: 'e-true', source: 'n-branch', sourceHandle: 'out_true', target: 'n-wait-true' },
        { id: 'e-false', source: 'n-branch', sourceHandle: 'out_false', target: 'n-wait-false' },
        { id: 'e-true-end', source: 'n-wait-true', target: 'n-end-true' },
        { id: 'e-false-end', source: 'n-wait-false', target: 'n-end-false' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = compileGraph(state)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.actions).toEqual([
        { type: 'mark_node', name: 'Start' },
        { type: 'start' },
        { type: 'mark_node', name: 'Check Item' },
        {
          type: 'branch',
          condition: 'has_key',
          true_actions: [
            { type: 'mark_node', name: 'Wait True' },
            { type: 'wait', seconds: 1 },
            { type: 'mark_node', name: 'End True' }
          ],
          false_actions: [
            { type: 'mark_node', name: 'Wait False' },
            { type: 'wait', seconds: 3 },
            { type: 'mark_node', name: 'End False' }
          ]
        }
      ])
    }
  })

  test('parallel compilation', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Parallel Scene',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        {
          id: 'n-pstart',
          type: 'parallel_start',
          name: 'Parallel Start',
          params: { joinId: 'n-pjoin', branches: ['b0', 'b1'] }
        },
        { id: 'n-p1', type: 'wait', name: 'Wait B0', params: { seconds: 1 } },
        { id: 'n-p2', type: 'wait', name: 'Wait B1', params: { seconds: 2 } },
        {
          id: 'n-pjoin',
          type: 'parallel_join',
          name: 'Parallel Join',
          params: { pairId: 'n-pstart', branches: ['b0', 'b1'] }
        },
        { id: 'n-end', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'n-start', target: 'n-pstart' },
        { id: 'e-b0', source: 'n-pstart', sourceHandle: 'out_b0', target: 'n-p1' },
        { id: 'e-b1', source: 'n-pstart', sourceHandle: 'out_b1', target: 'n-p2' },
        { id: 'e-j0', source: 'n-p1', target: 'n-pjoin', targetHandle: 'in_b0' },
        { id: 'e-j1', source: 'n-p2', target: 'n-pjoin', targetHandle: 'in_b1' },
        { id: 'e-end', source: 'n-pjoin', target: 'n-end' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = compileGraph(state)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.actions).toEqual([
        { type: 'mark_node', name: 'Start' },
        { type: 'start' },
        { type: 'mark_node', name: 'Parallel Start' },
        {
          type: 'parallel',
          actions: [
            [
              { type: 'mark_node', name: 'Wait B0' },
              { type: 'wait', seconds: 1 }
            ],
            [
              { type: 'mark_node', name: 'Wait B1' },
              { type: 'wait', seconds: 2 }
            ]
          ]
        },
        { type: 'mark_node', name: 'End' }
      ])
    }
  })

  test('waitSeconds on edge', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Edge Delay Scene',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        { id: 'n-end', type: 'end', name: 'End' }
      ],
      edges: [{ id: 'e1', source: 'n-start', target: 'n-end', waitSeconds: 5 }],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = compileGraph(state)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.actions).toEqual([
        { type: 'mark_node', name: 'Start' },
        { type: 'start' },
        { type: 'wait', seconds: 5 },
        { type: 'mark_node', name: 'End' }
      ])
    }
  })

  test('errors on missing start or end nodes', () => {
    const stateNoStart: RuntimeState = {
      schemaVersion: 1,
      title: 'No Start Node',
      nodes: [{ id: 'n-end', type: 'end', name: 'End' }],
      edges: [],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const stateNoEnd: RuntimeState = {
      schemaVersion: 1,
      title: 'No End Node',
      nodes: [{ id: 'n-start', type: 'start', name: 'Start' }],
      edges: [],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const resNoStart = compileGraph(stateNoStart)
    expect(resNoStart.ok).toBe(false)
    if (resNoStart.ok === false) {
      expect(resNoStart.error).toBeDefined()
    }

    const resNoEnd = compileGraph(stateNoEnd)
    expect(resNoEnd.ok).toBe(false)
    if (resNoEnd.ok === false) {
      expect(resNoEnd.error).toBeDefined()
    }
  })
})
