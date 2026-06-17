import type { RuntimeEdge, RuntimeNode } from '../runtimeTypes'
import type { CompiledAction } from './types'

export function filterRegularEdges(edges: RuntimeEdge[]): RuntimeEdge[] {
  const result: RuntimeEdge[] = []
  for (const edge of edges) {
    if (edge.sourceHandle !== '__pair' && edge.targetHandle !== '__pair') {
      result.push(edge)
    }
  }
  return result
}

export function getNormalizedNodeName(node: RuntimeNode): string {
  return String(node.name ?? '').trim()
}

export function compileBaseNode(node: RuntimeNode, exclude?: string[]): CompiledAction {
  const action: CompiledAction = { type: node.type }
  if (node.params) {
    for (const [key, value] of Object.entries(node.params)) {
      if (['branches', 'joinId', 'pairId'].includes(key)) continue
      if (exclude?.includes(key)) continue
      if (value !== undefined && value !== null && value !== '') {
        action[key] = value
      }
    }
  }
  return action
}
