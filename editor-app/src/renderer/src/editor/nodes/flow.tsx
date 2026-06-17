import React, { memo, useMemo } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'

// --- Flow-ноды ---

// Стартовая нода: только выход, без входа.
export const StartNode = memo(function StartNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="start" label={data.label} hasInput={false} hasOutput selected={selected} />
  )
})

// Конечная нода: только вход, без выхода.
export const EndNode = memo(function EndNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="end" label={data.label} hasInput hasOutput={false} selected={selected} />
  )
})

// Пауза: ждём N секунд.
export const WaitNode = memo(function WaitNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="wait" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.seconds', 'Time')}</span>
        <span className="customNodeParamValue">
          {String(seconds)}
          {t('nodes.preview.secondsSuffix', 's')}
        </span>
      </div>
    </BaseNode>
  )
})

// Остановка движения/действий персонажа.
export const HaltNode = memo(function HaltNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="halt" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})
