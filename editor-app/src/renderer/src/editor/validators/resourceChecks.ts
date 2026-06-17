import type { RuntimeNode } from '../runtimeTypes'
import type { ValidationEntry, ValidationContext } from './types'

export function checkResources(
  nodes: RuntimeNode[],
  context: ValidationContext,
  t: (key: string, args?: Record<string, string | number>) => string
): ValidationEntry[] {
  const entries: ValidationEntry[] = []
  const allResources = [...(context.objects ?? []), ...(context.sprites ?? [])]

  for (const node of nodes) {
    const params = node.params ?? {}

    // actor_create
    if (node.type === 'actor_create') {
      const key = String(params.actor_name ?? '').trim()
      if (key && allResources.length > 0 && !allResources.includes(key)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'actorCreateKeyNotFound',
          nodeId: node.id,
          message: t('validation.actorCreateKeyNotFound', { key })
        })
      }
    }

    // dialogue.file
    if (node.type === 'dialogue' && context.yarnFiles) {
      const file = String(params.file ?? '').trim()
      if (file) {
        const fileName = file.replace(/\.yarn$/i, '')
        const yarnFileNames = Array.from(context.yarnFiles.keys()).map((f) =>
          f.replace(/\.yarn$/i, '')
        )
        if (!yarnFileNames.includes(fileName)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'dialogueFileNotFound',
            nodeId: node.id,
            message: t('validation.dialogueFileNotFound', { file })
          })
        } else {
          const nodeName = String(params.node ?? '').trim()
          if (nodeName) {
            const yarnNodes =
              context.yarnFiles.get(file) ?? context.yarnFiles.get(file + '.yarn') ?? []
            if (yarnNodes.length > 0 && !yarnNodes.includes(nodeName)) {
              entries.push({
                severity: 'warn',
                defaultSeverity: 'warn',
                ruleId: 'dialogueNodeNotFound',
                nodeId: node.id,
                message: t('validation.dialogueNodeNotFound', { nodeName, file })
              })
            }
          }
        }
      }
    }

    // run_function.function
    if (node.type === 'run_function' && context.runFunctions) {
      const funcName = String(params.function ?? params.function_name ?? '').trim()
      if (
        funcName &&
        context.runFunctions.length > 0 &&
        !context.runFunctions.includes(funcName)
      ) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'runFunctionNotWhitelisted',
          nodeId: node.id,
          message: t('validation.runFunctionNotWhitelisted', { funcName })
        })
      }
    }

    // branch.condition
    if (node.type === 'branch' && context.branchConditions) {
      const cond = String(params.condition ?? '').trim()
      if (
        cond &&
        context.branchConditions.length > 0 &&
        !context.branchConditions.includes(cond)
      ) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'branchConditionNotWhitelisted',
          nodeId: node.id,
          message: t('validation.branchConditionNotWhitelisted', { cond })
        })
      }
    }

    // animate.sprite
    if (node.type === 'animate' && context.sprites) {
      const sprite = String(params.sprite ?? '').trim()
      if (sprite && context.sprites.length > 0 && !context.sprites.includes(sprite)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'animateSpriteNotFound',
          nodeId: node.id,
          message: t('validation.animateSpriteNotFound', { sprite })
        })
      }
    }

    // emote.sprite
    if (node.type === 'emote' && context.sprites) {
      const sprite = String(params.sprite ?? '').trim()
      if (sprite && context.sprites.length > 0 && !context.sprites.includes(sprite)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'emoteSpriteNotFound',
          nodeId: node.id,
          message: t('validation.emoteSpriteNotFound', { sprite })
        })
      }
    }

    // play_music.sound
    if (node.type === 'play_music' && context.sounds) {
      const sound = String(params.sound ?? '').trim()
      if (sound && context.sounds.length > 0 && !context.sounds.includes(sound)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicSoundNotFound',
          nodeId: node.id,
          message: t('validation.playMusicSoundNotFound', { sound })
        })
      }
    }

    // play_boss_music
    if (node.type === 'play_boss_music' && context.sounds) {
      const calm = String(params.calm ?? '').trim()
      if (calm && context.sounds.length > 0 && !context.sounds.includes(calm)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playBossMusicCalmNotFound',
          nodeId: node.id,
          message: t('validation.playBossMusicCalmNotFound', { sound: calm })
        })
      }
      const battle = String(params.battle ?? '').trim()
      if (battle && context.sounds.length > 0 && !context.sounds.includes(battle)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playBossMusicBattleNotFound',
          nodeId: node.id,
          message: t('validation.playBossMusicBattleNotFound', { sound: battle })
        })
      }
    }

    // play_music_intro
    if (node.type === 'play_music_intro' && context.sounds) {
      const intro = String(params.intro ?? '').trim()
      if (intro && context.sounds.length > 0 && !context.sounds.includes(intro)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicIntroNotFound',
          nodeId: node.id,
          message: t('validation.playMusicIntroNotFound', { sound: intro })
        })
      }
      const loop = String(params.loop ?? '').trim()
      if (loop && context.sounds.length > 0 && !context.sounds.includes(loop)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicLoopNotFound',
          nodeId: node.id,
          message: t('validation.playMusicLoopNotFound', { sound: loop })
        })
      }
    }

    // play_music_intro_layered
    if (node.type === 'play_music_intro_layered' && context.sounds) {
      const intro = String(params.intro ?? '').trim()
      if (intro && context.sounds.length > 0 && !context.sounds.includes(intro)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playMusicIntroNotFound',
          nodeId: node.id,
          message: t('validation.playMusicIntroNotFound', { sound: intro })
        })
      }
      const calm = String(params.calm ?? '').trim()
      if (calm && context.sounds.length > 0 && !context.sounds.includes(calm)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playBossMusicCalmNotFound',
          nodeId: node.id,
          message: t('validation.playBossMusicCalmNotFound', { sound: calm })
        })
      }
      const battle = String(params.battle ?? '').trim()
      if (battle && context.sounds.length > 0 && !context.sounds.includes(battle)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'playBossMusicBattleNotFound',
          nodeId: node.id,
          message: t('validation.playBossMusicBattleNotFound', { sound: battle })
        })
      }
    }
  }

  return entries
}
