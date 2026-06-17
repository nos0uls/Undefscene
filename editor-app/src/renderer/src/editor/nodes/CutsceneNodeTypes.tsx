import React from 'react'
import { Handle, Position } from '@xyflow/react'

// Тип данных, которые React Flow передаёт в каждую ноду.
export type CutsceneNodeData = {
  label?: string
  params?: Record<string, unknown>
}

// Тип пропсов, которые React Flow передаёт в custom node component.
export type CutsceneNodeProps = {
  data: CutsceneNodeData
  selected?: boolean
}

// Вспомогательная функция: рисуем список handles по веткам.
export function renderParallelHandles(
  kind: 'source' | 'target',
  branchIds: string[],
  hidden = false
): React.JSX.Element[] {
  const count = Math.max(1, branchIds.length)
  return branchIds.map((branchId, i) => {
    const topPct = ((i + 1) / (count + 1)) * 100
    const handleId = kind === 'source' ? `out_${branchId}` : `in_${branchId}`
    return (
      <Handle
        key={handleId}
        type={kind}
        id={handleId}
        position={kind === 'source' ? Position.Right : Position.Left}
        className="customHandle"
        style={{
          top: `${topPct}%`,
          opacity: hidden ? 0 : undefined,
          pointerEvents: hidden ? 'none' : undefined
        }}
      />
    )
  })
}

// Один общий handle для shared-режима.
// Под капотом ветка всё равно назначается автоматически по порядку подключений.
export function renderSharedParallelHandle(kind: 'source' | 'target'): React.JSX.Element {
  const handleId = kind === 'source' ? 'out_shared' : 'in_shared'
  return (
    <Handle
      key={handleId}
      type={kind}
      id={handleId}
      position={kind === 'source' ? Position.Right : Position.Left}
      className="customHandle customHandleShared"
      style={{ top: '50%' }}
    />
  )
}
