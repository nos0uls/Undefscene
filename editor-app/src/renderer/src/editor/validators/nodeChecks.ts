import type { RuntimeNode, RuntimeEdge } from '../runtimeTypes'
import type { ValidationEntry } from './types'
import { NODE_REGISTRY } from '../nodes/nodeRegistry'

const REQUIRED_PARAMS: Record<string, string[]> = {
  dialogue: [],
  set_dialogue_speed: ['speed'],
  wait_typing: [],
  dialogue_control: [],
  set_portrait_next: ['target', 'emotion'],
  set_portrait_now: ['target', 'emotion'],
  clear_dialogue: [],
  move: ['target'],
  set_position: ['target'],
  move_relative: ['target'],
  set_position_relative: ['target'],
  actor_create: ['actor_name'],
  actor_destroy: ['target'],
  animate: ['target'],
  set_animation_frame: ['target'],
  camera_track: ['target'],
  camera_track_until_stop: ['target'],
  camera_pan: ['x', 'y'],
  camera_pan_obj: ['target'],
  camera_center: ['x', 'y'],
  set_depth: ['target'],
  set_facing: ['target'],
  branch: ['condition'],
  run_function: [],
  follow_path: ['target'],
  camera_shake: [],
  auto_facing: ['target'],
  auto_walk: ['target'],
  tween: ['prop'],
  tween_camera: ['property'],
  set_property: ['property'],
  emote: ['target'],
  jump: ['target'],
  halt: ['target'],
  flip: ['target'],
  spin: ['target'],
  shake_object: ['target'],
  set_visible: ['target'],
  instant_mode: ['enabled'],
  mark_node: ['name'],
  partial_control: ['type'],
  wait_for_interact: ['target'],
  wait_until: ['condition_var'],
  set_flag: ['key'],
  spawn_entity: ['object', 'x', 'y'],
  destroy_entity: ['target'],
  play_music: ['sound'],
  stop_music: [],
  music_volume: [],
  music_duck: [],
  music_unduck: [],
  music_pitch: [],
  music_pause: [],
  music_resume: [],
  play_boss_music: ['calm', 'battle'],
  stop_boss_music: [],
  boss_music_phase: ['phases'],
  play_music_intro: ['intro', 'loop'],
  play_music_intro_layered: ['intro', 'calm', 'battle'],
  crossfade_music: ['intensity'],
  set_plot: ['value'],
  schedule_action: ['delay_seconds', 'action_type'],
  attach_to_target: ['target', 'parent_ref'],
  detach: ['target'],
  checkpoint_state: ['checkpoint_id'],
  restore_state: ['checkpoint_id'],
  room_change: ['room']
}

export function checkNodeParams(
  nodes: RuntimeNode[],
  outEdges: Map<string, RuntimeEdge[]>,
  actorKeys: Set<string>,
  markNodeNames: Map<string, string[]>,
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []

  for (const node of nodes) {
    const outgoing = outEdges.get(node.id) ?? []
    const nodeDisplayName =
      node.name && node.name.length > 0
        ? `"${node.name}"`
        : t('validation.unnamedNode', { type: node.type })

    // Висящая нода / линейный выход проверим в graphChecks/core. Но проверим тут количество выходов:
    if (
      node.type !== 'start' &&
      node.type !== 'end' &&
      node.type !== 'branch' &&
      node.type !== 'parallel_start' &&
      node.type !== 'parallel_join' &&
      outgoing.length > 1
    ) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'multipleOutgoingEdges',
        nodeId: node.id,
        message: t('validation.nodeMultipleOutputs', { name: nodeDisplayName })
      })
    }

    // 4. Проверяем обязательные параметры
    const requiredFields = REQUIRED_PARAMS[node.type]
    if (requiredFields) {
      const nodeDef = NODE_REGISTRY[node.type]
      for (const fieldKey of requiredFields) {
        const value = node.params?.[fieldKey]
        if (value === undefined || value === null || value === '') {
          const fieldDef = nodeDef?.fields.find((f) => f.key === fieldKey)
          const fieldLabel = fieldDef?.label || fieldKey

          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'missingRequiredParam',
            nodeId: node.id,
            message: t('validation.fieldEmpty', { name: nodeDisplayName, field: fieldLabel })
          })
        }
      }
    }

    // actor_create
    if (node.type === 'actor_create') {
      const spr = node.params?.actor_sprite
      const copyFrom = node.params?.copy_target
      const hasSpr = typeof spr === 'string' ? spr.trim().length > 0 : !!spr
      const hasCopy = typeof copyFrom === 'string' ? copyFrom.trim().length > 0 : !!copyFrom
      if (!hasSpr && !hasCopy) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'missingSpriteOrCopyFrom',
          nodeId: node.id,
          message: t('validation.actorCreateNoSprite', { name: nodeDisplayName })
        })
      }
    }

    // branch
    if (node.type === 'branch') {
      const hasFalse = outgoing.some((e) => e.sourceHandle === 'out_false')
      if (!hasFalse) {
        entries.push({
          severity: 'tip',
          defaultSeverity: 'tip',
          ruleId: 'branchMissingFalse',
          nodeId: node.id,
          message: t('validation.branchFalseEmpty', { name: nodeDisplayName })
        })
      }
    }

    // wait_until
    if (node.type === 'wait_until') {
      const conditionVar = String(node.params?.condition_var ?? '').trim()
      if (!conditionVar) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'waitUntilMissingCondition',
          nodeId: node.id,
          message: t('validation.waitUntilConditionEmpty', { name: nodeDisplayName })
        })
      }
      const timeout = Number(node.params?.timeout_seconds ?? 0)
      if (timeout < 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'waitUntilNegativeTimeout',
          nodeId: node.id,
          message: t('validation.waitUntilTimeoutNegative', { name: nodeDisplayName })
        })
      }
    }

    // tween
    if (node.type === 'tween') {
      const kind = String(node.params?.kind ?? 'instance').trim()
      const target = String(node.params?.target ?? '').trim()
      const property = String(
        node.params?.prop ?? node.params?.property ?? node.params?.field ?? ''
      ).trim()
      const toValue = node.params?.to ?? node.params?.end_value ?? node.params?.value
      if (kind !== 'camera' && !target) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'tweenMissingTarget',
          nodeId: node.id,
          message: t('validation.tweenTargetRequired', { name: nodeDisplayName })
        })
      }
      if (!property) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'tweenMissingProperty',
          nodeId: node.id,
          message: t('validation.tweenNoProperty', { name: nodeDisplayName })
        })
      }
      if (toValue === undefined || toValue === null || toValue === '') {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'tweenMissingToValue',
          nodeId: node.id,
          message: t('validation.tweenEndValueMissing', { name: nodeDisplayName })
        })
      }
    }

    // set_property
    if (node.type === 'set_property') {
      const kind = String(node.params?.kind ?? 'instance').trim()
      const target = String(node.params?.target ?? '').trim()
      const property = String(
        node.params?.prop ?? node.params?.property ?? node.params?.field ?? ''
      ).trim()
      const value = node.params?.value
      if (kind !== 'camera' && !target) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'setPropertyMissingTarget',
          nodeId: node.id,
          message: t('validation.tweenTargetRequired', { name: nodeDisplayName })
        })
      }
      if (!property) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'setPropertyMissingProperty',
          nodeId: node.id,
          message: t('validation.setPropertyNoProperty', { name: nodeDisplayName })
        })
      }
      if (value === undefined || value === null || value === '') {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'setPropertyMissingValue',
          nodeId: node.id,
          message: t('validation.setPropertyValueEmpty', { name: nodeDisplayName })
        })
      }
    }

    // play_sfx
    if (node.type === 'play_sfx') {
      const sound = String(node.params?.sound ?? node.params?.key ?? '').trim()
      if (!sound) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicMissingSound',
          nodeId: node.id,
          message: t('validation.playSfxNoSound', { name: nodeDisplayName })
        })
      }
    }

    // play_music
    if (node.type === 'play_music') {
      const sound = String(node.params?.sound ?? '').trim()
      if (!sound) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicMissingSound',
          nodeId: node.id,
          message: t('validation.playMusicNoSound', { name: nodeDisplayName })
        })
      }
    }

    // play_boss_music
    if (node.type === 'play_boss_music') {
      const calm = String(node.params?.calm ?? '').trim()
      const battle = String(node.params?.battle ?? '').trim()
      if (!calm) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playBossMusicMissingCalm',
          nodeId: node.id,
          message: t('validation.playBossMusicNoCalm', { name: nodeDisplayName })
        })
      }
      if (!battle) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playBossMusicMissingBattle',
          nodeId: node.id,
          message: t('validation.playBossMusicNoBattle', { name: nodeDisplayName })
        })
      }
    }

    // play_music_intro
    if (node.type === 'play_music_intro') {
      const intro = String(node.params?.intro ?? '').trim()
      const loop = String(node.params?.loop ?? '').trim()
      if (!intro) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicIntroMissingIntro',
          nodeId: node.id,
          message: t('validation.playMusicIntroNoIntro', { name: nodeDisplayName })
        })
      }
      if (!loop) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicIntroMissingLoop',
          nodeId: node.id,
          message: t('validation.playMusicIntroNoLoop', { name: nodeDisplayName })
        })
      }
    }

    // crossfade_music
    if (node.type === 'crossfade_music') {
      const intensity = Number(node.params?.intensity ?? NaN)
      if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'crossfadeMusicIntensityInvalid',
          nodeId: node.id,
          message: t('validation.crossfadeMusicIntensityInvalid', { name: nodeDisplayName })
        })
      }
    }

    // music_pitch
    if (node.type === 'music_pitch') {
      const pitch = Number(node.params?.pitch ?? NaN)
      if (!Number.isFinite(pitch) || pitch <= 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'musicPitchInvalid',
          nodeId: node.id,
          message: t('validation.musicPitchInvalid', { name: nodeDisplayName })
        })
      } else if (pitch < 0.5 || pitch > 2.0) {
        entries.push({
          severity: 'tip',
          defaultSeverity: 'tip',
          ruleId: 'musicPitchExtreme',
          nodeId: node.id,
          message: t('validation.musicPitchExtreme', { name: nodeDisplayName, pitch })
        })
      }
    }

    // run_function
    if (node.type === 'run_function') {
      const fn =
        (typeof node.params?.function === 'string' && node.params.function.trim()) ||
        (typeof node.params?.function_name === 'string' && node.params.function_name.trim()) ||
        ''

      if (!fn) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'runFunctionMissingName',
          nodeId: node.id,
          message: t('validation.runFunctionNameEmpty', { name: nodeDisplayName })
        })
      }

      const rawArgs = node.params?.args
      if (typeof rawArgs === 'string' && rawArgs.trim().length > 0) {
        try {
          JSON.parse(rawArgs)
        } catch {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'runFunctionInvalidArgs',
            nodeId: node.id,
            message: t('validation.runFunctionArgsInvalid', { name: nodeDisplayName })
          })
        }
      }
    }

    // schedule_action
    if (node.type === 'schedule_action') {
      const rawParams = node.params?.action_params
      if (typeof rawParams === 'string' && rawParams.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawParams)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            entries.push({
              severity: 'tip',
              defaultSeverity: 'tip',
              ruleId: 'scheduleActionParamsNotObject',
              nodeId: node.id,
              message: t('validation.scheduleActionParamsNotObject', { name: nodeDisplayName })
            })
          }
        } catch {
          entries.push({
            severity: 'tip',
            defaultSeverity: 'tip',
            ruleId: 'scheduleActionInvalidParams',
            nodeId: node.id,
            message: t('validation.scheduleActionInvalidParams', { name: nodeDisplayName })
          })
        }
      }
      const delay = Number(node.params?.delay_seconds ?? 0)
      if (!Number.isFinite(delay) || delay < 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'scheduleActionInvalidDelay',
          nodeId: node.id,
          message: t('validation.scheduleActionInvalidDelay', { name: nodeDisplayName })
        })
      }
    }

    // dialogue
    if (node.type === 'dialogue') {
      const file = String(node.params?.file ?? '').trim()
      if (!file) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'dialogueMissingFile',
          nodeId: node.id,
          message: t('validation.dialogueFileNotSet', { name: nodeDisplayName })
        })
      }
    }

    // checkpoint_state
    if (node.type === 'checkpoint_state') {
      for (const field of ['include_globals', 'include_instances'] as const) {
        const raw = String(node.params?.[field] ?? '').trim()
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed)) {
              entries.push({
                severity: 'warn',
                defaultSeverity: 'warn',
                ruleId: 'checkpointInvalidArray',
                nodeId: node.id,
                message: t('validation.checkpointInvalidArray', { field, name: nodeDisplayName })
              })
            }
          } catch {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'checkpointInvalidJson',
              nodeId: node.id,
              message: t('validation.checkpointInvalidJson', { field, name: nodeDisplayName })
            })
          }
        }
      }
    }

    // camera_shake / shake_object
    if (node.type === 'camera_shake' || node.type === 'shake_object') {
      const seconds = Number(node.params?.seconds ?? 0)
      if (
        (node.type === 'camera_shake' && seconds <= 0) ||
        (node.type === 'shake_object' && seconds < 0)
      ) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId:
            node.type === 'camera_shake' ? 'waitInvalidSeconds' : 'shakeObjectNegativeSeconds',
          nodeId: node.id,
          message: t(
            node.type === 'camera_shake'
              ? 'validation.cameraShakeSecondsInvalid'
              : 'validation.shakeObjectNegativeSeconds',
            { name: nodeDisplayName }
          )
        })
      }
      const frequency = Number(node.params?.frequency ?? 1)
      if (Number.isFinite(frequency) && frequency < 1) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'shakeInvalidFrequency',
          nodeId: node.id,
          message: t('validation.shakeFrequencyTooLow', { name: nodeDisplayName })
        })
      }
      const magnitudeX = Number(node.params?.magnitude_x ?? -1)
      if (Number.isFinite(magnitudeX) && magnitudeX < 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'shakeInvalidMagnitudeX',
          nodeId: node.id,
          message: t('validation.shakeMagnitudeXNegative', { name: nodeDisplayName })
        })
      }
      const magnitudeY = Number(node.params?.magnitude_y ?? -1)
      if (Number.isFinite(magnitudeY) && magnitudeY < 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'shakeInvalidMagnitudeY',
          nodeId: node.id,
          message: t('validation.shakeMagnitudeYNegative', { name: nodeDisplayName })
        })
      }
    }

    // follow_path
    if (node.type === 'follow_path') {
      const points = Array.isArray(node.params?.points) ? node.params?.points : []
      if (points.length === 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'followPathEmptyPoints',
          nodeId: node.id,
          message: t('validation.followPathEmpty', { name: nodeDisplayName })
        })
      } else if (points.length < 2) {
        entries.push({
          severity: 'tip',
          defaultSeverity: 'tip',
          ruleId: 'followPathTooFewPoints',
          nodeId: node.id,
          message: t('validation.followPathOnePoint', { name: nodeDisplayName })
        })
      }
    }

    // halt
    if (node.type === 'halt') {
      if (outgoing.length > 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'haltHasOutgoingEdges',
          nodeId: node.id,
          message: t('validation.haltHasOutgoing', { name: nodeDisplayName })
        })
      }
    }

    // mark_node
    if (node.type === 'mark_node') {
      const markName = String(node.params?.name ?? '').trim()
      if (!markName) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'markNodeMissingName',
          nodeId: node.id,
          message: t('validation.markNodeNameEmpty', { name: nodeDisplayName })
        })
      }
    }

    // set_facing
    if (node.type === 'set_facing') {
      const direction = String(node.params?.direction ?? '')
        .trim()
        .toLowerCase()
      if (
        direction &&
        direction !== 'left' &&
        direction !== 'right' &&
        direction !== 'up' &&
        direction !== 'down'
      ) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'setFacingInvalidDirection',
          nodeId: node.id,
          message: t('validation.setFacingInvalidDirection', { name: nodeDisplayName, direction })
        })
      }
    }

    // jump
    if (node.type === 'jump') {
      const jumpTarget = String(node.params?.target ?? '').trim()
      if (!jumpTarget) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'jumpMissingTarget',
          nodeId: node.id,
          message: t('validation.jumpTargetEmpty', { name: nodeDisplayName })
        })
      } else if (!markNodeNames.has(jumpTarget)) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'jumpTargetNotFound',
          nodeId: node.id,
          message: t('validation.jumpTargetNotFound', { name: nodeDisplayName, target: jumpTarget })
        })
      }
      const jumpSeconds = Number(node.params?.seconds ?? 0)
      if (jumpSeconds <= 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'jumpInvalidSeconds',
          nodeId: node.id,
          message: t('validation.jumpInvalidSeconds', { name: nodeDisplayName })
        })
      }
    }

    // restore_state
    if (node.type === 'restore_state') {
      const checkpointId = String(node.params?.checkpoint_id ?? '').trim()
      if (!checkpointId) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'restoreStateMissingId',
          nodeId: node.id,
          message: t('validation.restoreStateMissingId', { name: nodeDisplayName })
        })
      }
    }

    // detach
    if (node.type === 'detach') {
      const targetRef = String(node.params?.target ?? '').trim()
      if (!targetRef) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'detachMissingTarget',
          nodeId: node.id,
          message: t('validation.detachMissingTarget', { name: nodeDisplayName })
        })
      }
    }

    // spawn_entity
    if (node.type === 'spawn_entity') {
      const objectName = String(node.params?.object ?? '').trim()
      if (!objectName) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'spawnEntityMissingObject',
          nodeId: node.id,
          message: t('validation.spawnEntityMissingObject', { name: nodeDisplayName })
        })
      }
    }

    // emote
    if (node.type === 'emote') {
      const sprite = String(node.params?.sprite ?? '').trim()
      if (!sprite) {
        entries.push({
          severity: 'tip',
          defaultSeverity: 'tip',
          ruleId: 'emoteMissingSprite',
          nodeId: node.id,
          message: t('validation.emoteMissingSprite', { name: nodeDisplayName })
        })
      }
    }

    // Actor target resolution
    const actorTargetTypes = new Set([
      'move',
      'actor_destroy',
      'set_position',
      'animate',
      'camera_track',
      'camera_track_until_stop',
      'camera_pan_obj',
      'set_depth',
      'set_facing',
      'follow_path',
      'auto_facing',
      'auto_walk',
      'emote',
      'halt',
      'flip',
      'spin',
      'shake_object',
      'set_visible'
    ])
    if (actorTargetTypes.has(node.type)) {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player' && !actorKeys.has(target)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'actorTargetNotFound',
          nodeId: node.id,
          message: t('validation.actorTargetNotCreated', { name: nodeDisplayName, target })
        })
      }
    }

    if (node.type === 'attach_to_target' || node.type === 'detach') {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player' && !actorKeys.has(target)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'actorTargetNotFound',
          nodeId: node.id,
          message: t('validation.actorTargetNotCreated', { name: nodeDisplayName, target })
        })
      }
    }
  }

  return entries
}
