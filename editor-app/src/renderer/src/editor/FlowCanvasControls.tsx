import React, { memo } from 'react'
import { Controls } from '@xyflow/react'

export const FlowCanvasControls = memo(function FlowCanvasControls(): React.JSX.Element {
  return <Controls showInteractive={false} />
})
