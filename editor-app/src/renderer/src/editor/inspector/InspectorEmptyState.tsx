import React from 'react'
import type { InspectorEmptyStateProps } from './types'

export const InspectorEmptyState = React.memo(function InspectorEmptyState({
  t
}: InspectorEmptyStateProps): React.JSX.Element {
  return (
    <div className="inspectorEmptyState">
      <svg
        className="inspectorEmptyIcon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M17.5 14v6M14.5 17h6" />
      </svg>
      <span className="inspectorEmptyText">
        {t('editor.inspectNodeHint', 'Select a node to inspect it')}
      </span>
    </div>
  )
})
