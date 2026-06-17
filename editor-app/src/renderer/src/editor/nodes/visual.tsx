import React, { memo, useMemo } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'

// --- Visual & Effects ---

// Создание актёра.
export const ActorCreateNode = memo(function ActorCreateNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const key = data.params?.actor_name ?? ''
  const obj = data.params?.actor_sprite ?? ''
  return (
    <BaseNode nodeType="actor_create" selected={selected}>
      <div className="customNodeParam">{String(key)}</div>
      {obj && <div className="customNodeParam">{String(obj)}</div>}
    </BaseNode>
  )
})

// Уничтожение актёра.
export const ActorDestroyNode = memo(function ActorDestroyNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="actor_destroy" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

export const AnimateNode = memo(function AnimateNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  return (
    <BaseNode nodeType="animate" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      {sprite && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.fields.sprite', 'Sprite')}</span>
          <span className="customNodeParamValue">{String(sprite)}</span>
        </div>
      )}
    </BaseNode>
  )
})

export const SetAnimationFrameNode = memo(function SetAnimationFrameNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const imageIndex = data.params?.image_index ?? 0
  const imageSpeed = data.params?.image_speed ?? 1
  const pause = data.params?.pause ?? false
  return (
    <BaseNode nodeType="set_animation_frame" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.image_index', 'Frame')}</span>
        <span className="customNodeParamValue">{String(imageIndex)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.image_speed', 'Speed')}</span>
        <span className="customNodeParamValue">{String(imageSpeed)}</span>
        {pause && (
          <span className="customNodeParamValue"> {t('nodes.preview.paused', '(paused)')}</span>
        )}
      </div>
    </BaseNode>
  )
})

export const SetFacingNode = memo(function SetFacingNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const direction = data.params?.direction ?? '?'
  return (
    <BaseNode nodeType="set_facing" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        {t('nodes.preview.direction', 'dir:')} {String(direction)}
      </div>
    </BaseNode>
  )
})

export const SetDepthNode = memo(function SetDepthNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const depth = data.params?.depth ?? '?'
  return (
    <BaseNode nodeType="set_depth" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        {t('nodes.preview.depth', 'depth:')} {String(depth)}
      </div>
    </BaseNode>
  )
})

export const AutoFacingNode = memo(function AutoFacingNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode nodeType="auto_facing" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

export const AutoWalkNode = memo(function AutoWalkNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode nodeType="auto_walk" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

export const FadeInNode = memo(function FadeInNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="fade_in" selected={selected}>
      <div className="customNodeParam">
        {String(seconds)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const FadeOutNode = memo(function FadeOutNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="fade_out" selected={selected}>
      <div className="customNodeParam">
        {String(seconds)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const EmoteNode = memo(function EmoteNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  const wait = data.params?.wait === true

  const waitStyle = useMemo(() => ({ opacity: 0.5, fontSize: '0.9em' }), [])
  return (
    <BaseNode nodeType="emote" selected={selected}>
      <div className="customNodeParam">
        {String(target)} {wait && <span style={waitStyle}>(wait)</span>}
      </div>
      {sprite && <div className="customNodeParam">{String(sprite)}</div>}
    </BaseNode>
  )
})

export const FlipNode = memo(function FlipNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const flipped = data.params?.flipped ?? true
  return (
    <BaseNode nodeType="flip" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(flipped)}</div>
    </BaseNode>
  )
})

export const SpinNode = memo(function SpinNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const speed = data.params?.speed ?? '?'
  return (
    <BaseNode nodeType="spin" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        {t('nodes.fields.speed', 'speed')}: {String(speed)}
      </div>
    </BaseNode>
  )
})

export const ShakeObjectNode = memo(function ShakeObjectNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const magnitude = data.params?.magnitude ?? 4
  const magnitudeX = data.params?.magnitude_x
  const magnitudeY = data.params?.magnitude_y
  const hasSeparateMagnitudes = typeof magnitudeX === 'number' || typeof magnitudeY === 'number'
  return (
    <BaseNode nodeType="shake_object" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
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

export const SetVisibleNode = memo(function SetVisibleNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const visible = data.params?.visible ?? true
  return (
    <BaseNode nodeType="set_visible" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(visible)}</div>
    </BaseNode>
  )
})

export const InstantModeNode = memo(function InstantModeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode nodeType="instant_mode" selected={selected}>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

// Установка эмоции актёра.
export const SetEmotionNode = memo(function SetEmotionNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const emotion = data.params?.emotion ?? ''
  return (
    <BaseNode nodeType="set_emotion" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.emotion', 'Emotion')}</span>
        <span className="customNodeParamValue">{String(emotion)}</span>
      </div>
    </BaseNode>
  )
})

// Интерполяция свойств актёра.
export const LerpNode = memo(function LerpNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const property = data.params?.property ?? ''
  const toValue = data.params?.to_value ?? '?'
  return (
    <BaseNode nodeType="lerp" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamValue">
          {String(property)} → {String(toValue)}
        </span>
      </div>
    </BaseNode>
  )
})
