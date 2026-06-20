import React, { memo } from 'react'
import { MiniMap } from '@xyflow/react'

const RF_MINIMAP_STYLE: React.CSSProperties = { overflow: 'hidden' }

type FlowCanvasMiniMapProps = {
  miniMapNodeThreshold: number
  nodeCount: number
}

export const FlowCanvasMiniMap = memo(function FlowCanvasMiniMap({
  miniMapNodeThreshold,
  nodeCount
}: FlowCanvasMiniMapProps): React.JSX.Element | null {
  // 0 = всегда скрыта, -1 = всегда показана, >0 = скрыть если нод > порога
  if (miniMapNodeThreshold === 0) {
    return null
  }

  if (miniMapNodeThreshold === -1 || nodeCount <= miniMapNodeThreshold) {
    return (
      <MiniMap
        pannable
        zoomable
        nodeColor="var(--accent-muted)"
        nodeStrokeColor="var(--accent-default)"
        nodeBorderRadius={2}
        nodeStrokeWidth={1}
        maskColor="color-mix(in srgb, var(--bg-base) 80%, transparent)"
        maskStrokeColor="var(--accent-default)"
        maskStrokeWidth={1}
        style={RF_MINIMAP_STYLE}
      />
    )
  }

  return null
})
