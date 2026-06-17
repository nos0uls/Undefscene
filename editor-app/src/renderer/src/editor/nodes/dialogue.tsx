import React, { memo, useMemo } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'

// --- Dialogue ---

// Диалоговая нода.
export const DialogueNode = memo(function DialogueNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const file = data.params?.file ?? ''
  const node = data.params?.node ?? ''
  return (
    <BaseNode nodeType="dialogue" selected={selected}>
      {file && <div className="customNodeParam">{String(file)}</div>}
      {node && <div className="customNodeParam">→ {String(node)}</div>}
      {data.label && !file && <div className="customNodeParam">{data.label}</div>}
    </BaseNode>
  )
})

// Ожидание завершения диалога.
export const WaitForDialogueNode = memo(function WaitForDialogueNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const controller = data.params?.dialogue_controller ?? ''
  return (
    <BaseNode nodeType="wait_for_dialogue" selected={selected}>
      {controller && <div className="customNodeParam">{String(controller)}</div>}
      {!controller && (
        <div className="customNodeParam">{t('nodes.preview.activeTextbox', 'active textbox')}</div>
      )}
    </BaseNode>
  )
})

// Установка скорости печати диалога.
export const SetDialogueSpeedNode = memo(function SetDialogueSpeedNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const speed = data.params?.speed ?? '?'
  return (
    <BaseNode nodeType="set_dialogue_speed" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.speed', 'Speed')}</span>
        <span className="customNodeParamValue">
          {String(speed)} {t('nodes.preview.charsPerSec', 'ch/s')}
        </span>
      </div>
    </BaseNode>
  )
})

// Ожидание завершения печати текста.
export const WaitTypingNode = memo(function WaitTypingNode({
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  return (
    <BaseNode nodeType="wait_typing" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.waitForTyping', 'wait for typing')}</div>
    </BaseNode>
  )
})

// Управление поведением диалогового окна.
export const DialogueControlNode = memo(function DialogueControlNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const preventSkip = data.params?.prevent_skip ?? false
  const stayOpen = data.params?.stay_open ?? false
  const autoAdvance = data.params?.auto_advance ?? false
  const flags = useMemo(() => {
    const f: string[] = []
    if (preventSkip) f.push(t('nodes.preview.noSkip', 'no skip'))
    if (stayOpen) f.push(t('nodes.preview.stayOpen', 'stay open'))
    if (autoAdvance) f.push(t('nodes.preview.autoAdvance', 'auto advance'))
    return f
  }, [preventSkip, stayOpen, autoAdvance, t])
  return (
    <BaseNode nodeType="dialogue_control" selected={selected}>
      <div className="customNodeParam">
        {flags.length > 0 ? flags.join(', ') : t('nodes.preview.default', 'default')}
      </div>
    </BaseNode>
  )
})

// Установка портрета для следующей реплики.
export const SetPortraitNextNode = memo(function SetPortraitNextNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const emotion = data.params?.emotion ?? ''
  return (
    <BaseNode nodeType="set_portrait_next" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.emotion', 'Emotion')}</span>
        <span className="customNodeParamValue">{String(emotion)}</span>
      </div>
    </BaseNode>
  )
})

// Установка портрета немедленно.
export const SetPortraitNowNode = memo(function SetPortraitNowNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const emotion = data.params?.emotion ?? ''
  return (
    <BaseNode nodeType="set_portrait_now" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.emotion', 'Emotion')}</span>
        <span className="customNodeParamValue">{String(emotion)}</span>
      </div>
    </BaseNode>
  )
})

// Очистка диалогового окна.
export const ClearDialogueNode = memo(function ClearDialogueNode({
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  return (
    <BaseNode nodeType="clear_dialogue" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.clearTextbox', 'clear textbox')}</div>
    </BaseNode>
  )
})
