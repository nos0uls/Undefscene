import { describe, test, expect } from 'vitest'
import { validateGraph } from '../validators'
import type { RuntimeState } from '../runtimeTypes'

describe('validateGraph', () => {
  test('valid scene passes validation without errors', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Valid Scene',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        { id: 'n-end', type: 'end', name: 'End' }
      ],
      edges: [{ id: 'e1', source: 'n-start', target: 'n-end' }],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = validateGraph(state)
    expect(result.hasErrors).toBe(false)
  })

  test('missing start node reports error', () => {
    const state: RuntimeState = {
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

    const result = validateGraph(state)
    expect(result.hasErrors).toBe(true)
    const err = result.entries.find((e) => e.ruleId === 'missingStartNode')
    expect(err).toBeDefined()
    expect(err?.severity).toBe('error')
  })

  test('missing end node reports error', () => {
    const state: RuntimeState = {
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

    const result = validateGraph(state)
    expect(result.hasErrors).toBe(true)
    const err = result.entries.find((e) => e.ruleId === 'missingEndNode')
    expect(err).toBeDefined()
    expect(err?.severity).toBe('error')
  })

  test('duplicate names reports tips', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Duplicate Name',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        { id: 'n-wait1', type: 'wait', name: 'SameName', params: { seconds: 1 } },
        { id: 'n-wait2', type: 'wait', name: 'SameName', params: { seconds: 2 } },
        { id: 'n-end', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'n-start', target: 'n-wait1' },
        { id: 'e2', source: 'n-wait1', target: 'n-wait2' },
        { id: 'e3', source: 'n-wait2', target: 'n-end' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = validateGraph(state)
    // Duplicate names should just be tips, not blocking errors
    expect(result.hasErrors).toBe(false)
    const tips = result.entries.filter((e) => e.ruleId === 'duplicateName')
    expect(tips.length).toBe(2)
  })

  test('missing required parameters reports warning', () => {
    const state: RuntimeState = {
      schemaVersion: 1,
      title: 'Missing Params',
      nodes: [
        { id: 'n-start', type: 'start', name: 'Start' },
        { id: 'n-move', type: 'move', name: 'Move NPC', params: { target: '' } }, // target is required
        { id: 'n-end', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'n-start', target: 'n-move' },
        { id: 'e2', source: 'n-move', target: 'n-end' }
      ],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0,
      notes: []
    }

    const result = validateGraph(state)
    expect(result.hasErrors).toBe(false) // missing params is warn, not error (doesn't block export)
    const warn = result.entries.find((e) => e.ruleId === 'missingRequiredParam')
    expect(warn).toBeDefined()
    expect(warn?.severity).toBe('warn')
  })
})
