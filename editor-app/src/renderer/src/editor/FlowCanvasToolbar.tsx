import React, { memo } from 'react'
import { Panel } from '@xyflow/react'
import { Plus } from 'lucide-react'

const RF_FAB_PANEL_STYLE: React.CSSProperties = { marginLeft: 74, marginBottom: 15 }

type FlowCanvasToolbarProps = {
  onAddNode: () => void
  addButtonTitle: string
  addNodeAriaLabel: string
}

export const FlowCanvasToolbar = memo(function FlowCanvasToolbar({
  onAddNode,
  addButtonTitle,
  addNodeAriaLabel
}: FlowCanvasToolbarProps): React.JSX.Element {
  return (
    <Panel position="bottom-left" style={RF_FAB_PANEL_STYLE}>
      <button
        className="actionButtonPlus"
        onClick={onAddNode}
        title={addButtonTitle}
        aria-label={addNodeAriaLabel}
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>
    </Panel>
  )
})
