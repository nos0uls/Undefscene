import React, { memo, useMemo } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'

// --- Movement-ноды ---

// Перемещение актёра в точку.
export const MoveNode = memo(function MoveNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="move" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.targetPosition', 'Target')}</span>
        <span className="customNodeParamValue">
          {String(x)}, {String(y)}
        </span>
      </div>
    </BaseNode>
  )
})

// Перемещение по набору точек.
export const FollowPathNode = memo(function FollowPathNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const pointsData = Array.isArray(data.params?.points) ? data.params.points : []
  const points = pointsData.length
  return (
    <BaseNode nodeType="follow_path" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        {points} {t('nodes.preview.points', 'points')}
      </div>
    </BaseNode>
  )
})

// Мгновенная установка позиции.
export const SetPositionNode = memo(function SetPositionNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="set_position" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        @ {String(x)}, {String(y)}
      </div>
    </BaseNode>
  )
})

// Относительное перемещение актёра.
export const MoveRelativeNode = memo(function MoveRelativeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const dx = data.params?.dx ?? '?'
  const dy = data.params?.dy ?? '?'
  return (
    <BaseNode nodeType="move_relative" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.offset', 'Offset')}</span>
        <span className="customNodeParamValue">
          {String(dx)}, {String(dy)}
        </span>
      </div>
    </BaseNode>
  )
})

// Мгновенная установка относительной позиции.
export const SetPositionRelativeNode = memo(function SetPositionRelativeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const dx = data.params?.dx ?? '?'
  const dy = data.params?.dy ?? '?'
  return (
    <BaseNode nodeType="set_position_relative" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        + {String(dx)}, {String(dy)}
      </div>
    </BaseNode>
  )
})

// Прыжок актёра.
export const JumpNode = memo(function JumpNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="jump" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        → {String(x)}, {String(y)}
      </div>
    </BaseNode>
  )
})

// Прямое перемещение актёра.
export const MoveDirectNode = memo(function MoveDirectNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="move_direct" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.targetPosition', 'Target')}</span>
        <span className="customNodeParamValue">
          {String(x)}, {String(y)}
        </span>
      </div>
    </BaseNode>
  )
})

// Перемещение в относительном направлении.
export const MoveRelativeDirectionNode = memo(function MoveRelativeDirectionNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const direction = data.params?.direction ?? '?'
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="move_relative_direction" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.direction', 'Dir')}</span>
        <span className="customNodeParamValue">
          {String(direction)} ({String(seconds)}s)
        </span>
      </div>
    </BaseNode>
  )
})
