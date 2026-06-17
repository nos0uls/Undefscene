import React, { memo, useMemo } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'

// --- Audio & Music ---

export const PlaySFXNode = memo(function PlaySFXNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const sound = data.params?.sound ?? ''
  return (
    <BaseNode nodeType="play_sfx" selected={selected}>
      {sound && <div className="customNodeParam">{String(sound)}</div>}
    </BaseNode>
  )
})

export const PlayMusicNode = memo(function PlayMusicNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const sound = data.params?.sound ?? ''
  const volume = data.params?.volume ?? 1
  return (
    <BaseNode nodeType="play_music" selected={selected}>
      {sound && <div className="customNodeParam">{String(sound)}</div>}
      <div className="customNodeParam">
        {t('nodes.preview.volume', 'vol')}: {String(volume)}
      </div>
    </BaseNode>
  )
})

export const StopMusicNode = memo(function StopMusicNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="stop_music" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const MusicVolumeNode = memo(function MusicVolumeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const volume = data.params?.volume ?? 1
  const fade = data.params?.fade ?? 0.5
  return (
    <BaseNode nodeType="music_volume" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.preview.volume', 'vol')}: {String(volume)}
      </div>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const MusicDuckNode = memo(function MusicDuckNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const multiplier = data.params?.multiplier ?? 0.3
  const fade = data.params?.fade ?? 0.3
  return (
    <BaseNode nodeType="music_duck" selected={selected}>
      <div className="customNodeParam">x{String(multiplier)}</div>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const MusicUnduckNode = memo(function MusicUnduckNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 0.3
  return (
    <BaseNode nodeType="music_unduck" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const MusicPitchNode = memo(function MusicPitchNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const pitch = data.params?.pitch ?? 1
  return (
    <BaseNode nodeType="music_pitch" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.fields.pitch', 'pitch')}: {String(pitch)}
      </div>
    </BaseNode>
  )
})

export const MusicPauseNode = memo(function MusicPauseNode({
  selected
}: CutsceneNodeProps): React.JSX.Element {
  return <BaseNode nodeType="music_pause" selected={selected} />
})

export const MusicResumeNode = memo(function MusicResumeNode({
  selected
}: CutsceneNodeProps): React.JSX.Element {
  return <BaseNode nodeType="music_resume" selected={selected} />
})

export const PlayBossMusicNode = memo(function PlayBossMusicNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const calm = data.params?.calm ?? ''
  const battle = data.params?.battle ?? ''
  return (
    <BaseNode nodeType="play_boss_music" selected={selected}>
      {calm && (
        <div className="customNodeParam">
          {t('nodes.fields.calm', 'calm')}: {String(calm)}
        </div>
      )}
      {battle && (
        <div className="customNodeParam">
          {t('nodes.fields.battle', 'battle')}: {String(battle)}
        </div>
      )}
    </BaseNode>
  )
})

export const StopBossMusicNode = memo(function StopBossMusicNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="stop_boss_music" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const BossMusicPhaseNode = memo(function BossMusicPhaseNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 0.5
  return (
    <BaseNode nodeType="boss_music_phase" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})

export const PlayMusicIntroNode = memo(function PlayMusicIntroNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const intro = data.params?.intro ?? ''
  const loop = data.params?.loop ?? ''
  return (
    <BaseNode nodeType="play_music_intro" selected={selected}>
      {intro && (
        <div className="customNodeParam">
          {t('nodes.fields.intro', 'intro')}: {String(intro)}
        </div>
      )}
      {loop && (
        <div className="customNodeParam">
          {t('nodes.fields.loop', 'loop')}: {String(loop)}
        </div>
      )}
    </BaseNode>
  )
})

export const PlayMusicIntroLayeredNode = memo(function PlayMusicIntroLayeredNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const intro = data.params?.intro ?? ''
  const calm = data.params?.calm ?? ''
  const battle = data.params?.battle ?? ''
  return (
    <BaseNode nodeType="play_music_intro_layered" selected={selected}>
      {intro && (
        <div className="customNodeParam">
          {t('nodes.fields.intro', 'intro')}: {String(intro)}
        </div>
      )}
      {calm && (
        <div className="customNodeParam">
          {t('nodes.fields.calm', 'calm')}: {String(calm)}
        </div>
      )}
      {battle && (
        <div className="customNodeParam">
          {t('nodes.fields.battle', 'battle')}: {String(battle)}
        </div>
      )}
    </BaseNode>
  )
})

export const CrossfadeMusicNode = memo(function CrossfadeMusicNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const intensity = data.params?.intensity ?? 0.5
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="crossfade_music" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.fields.intensity', 'intensity')}: {String(intensity)}
      </div>
      <div className="customNodeParam">
        {t('nodes.preview.fade', 'fade')}: {String(fade)}
        {t('nodes.preview.secondsSuffix', 's')}
      </div>
    </BaseNode>
  )
})
