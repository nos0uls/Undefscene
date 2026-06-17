import React, { memo, useMemo } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'

// --- Camera ---

// Камера следит за целью.
export const CameraTrackNode = memo(function CameraTrackNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="camera_track" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.seconds', 'Duration')}</span>
        <span className="customNodeParamValue">
          {String(seconds)}
          {t('nodes.preview.secondsSuffix', 's')}
        </span>
      </div>
    </BaseNode>
  )
})

// Камера панорамирует к точке.
export const CameraPanNode = memo(function CameraPanNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="camera_pan" selected={selected}>
      <div className="customNodeParam">
        → {String(x)}, {String(y)}
      </div>
      <div className="customNodeParam">
        {String(seconds)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

// Тряска камеры.
export const CameraShakeNode = memo(function CameraShakeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  const magnitude = data.params?.magnitude ?? 4
  const magnitudeX = data.params?.magnitude_x
  const magnitudeY = data.params?.magnitude_y
  const hasSeparateMagnitudes = typeof magnitudeX === 'number' || typeof magnitudeY === 'number'
  return (
    <BaseNode nodeType="camera_shake" selected={selected}>
      <div className="customNodeParam">
        {String(seconds)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
      {hasSeparateMagnitudes ? (
        <div className="customNodeParam">
          {t('nodes.preview.magnitude', 'mag:')} {String(magnitudeX ?? magnitude)},
          {String(magnitudeY ?? magnitude)}
        </div>
      ) : (
        <div className="customNodeParam">
          {t('nodes.preview.magnitude', 'mag:')} {String(magnitude)}
        </div>
      )}
    </BaseNode>
  )
})

// Слежение за объектом до остановки.
export const CameraTrackUntilStopNode = memo(function CameraTrackUntilStopNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const ox = data.params?.offset_x ?? 0
  const oy = data.params?.offset_y ?? 0
  return (
    <BaseNode nodeType="camera_track_until_stop" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        ox:{String(ox)} oy:{String(oy)}
      </div>
    </BaseNode>
  )
})

// Центрирование камеры.
export const CameraCenterNode = memo(function CameraCenterNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const x = data.params?.x ?? 0
  const y = data.params?.y ?? 0
  return (
    <BaseNode nodeType="camera_center" selected={selected}>
      <div className="customNodeParam">
        ({String(x)}, {String(y)})
      </div>
    </BaseNode>
  )
})

// Панорамирование камеры к объекту.
export const CameraPanObjNode = memo(function CameraPanObjNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? 1
  return (
    <BaseNode nodeType="camera_pan_obj" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        {String(seconds)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

// Плавная анимация параметров камеры (Tween).
export const TweenCameraNode = memo(function TweenCameraNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const property = data.params?.property ?? ''
  const to_value = data.params?.to_value ?? 0
  const seconds = data.params?.seconds ?? 1
  const easing = data.params?.easing ?? 'linear'
  return (
    <BaseNode nodeType="tween_camera" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.preview.camera', 'camera')}.{String(property)} → {String(to_value)}
      </div>
      <div className="customNodeParam">
        {String(seconds)}
        {t('nodes.preview.secondsSuffix', 's')} {String(easing)}
      </div>
    </BaseNode>
  )
})

// Панорамирование камеры с заданной скоростью.
export const CameraPanSpeedNode = memo(function CameraPanSpeedNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  const speed = data.params?.speed ?? '?'
  return (
    <BaseNode nodeType="camera_pan_speed" selected={selected}>
      <div className="customNodeParam">
        → {String(x)}, {String(y)}
      </div>
      <div className="customNodeParam">
        {t('nodes.fields.speed', 'speed')}: {String(speed)}
      </div>
    </BaseNode>
  )
})
