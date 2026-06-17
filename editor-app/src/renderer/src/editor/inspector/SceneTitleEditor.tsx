import React from 'react'
import type { SceneTitleEditorProps } from './types'

export const SceneTitleEditor = React.memo(function SceneTitleEditor({
  localTitle,
  setLocalTitle,
  flushTitle,
  debounceTitle,
  t
}: SceneTitleEditorProps): React.JSX.Element {
  return (
    <label className="runtimeField">
      <span>{t('editor.sceneTitle', 'Scene title')}</span>
      <input
        className="runtimeInput"
        value={localTitle}
        onChange={(event) => {
          setLocalTitle(event.target.value)
          debounceTitle(event.target.value)
        }}
        onBlur={() => flushTitle(localTitle)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          flushTitle(localTitle)
          ;(event.currentTarget as HTMLElement).blur()
        }}
      />
    </label>
  )
})
