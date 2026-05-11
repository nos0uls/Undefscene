// validateGraph.ts — Валидация графа перед экспортом.
// Проверяет структуру графа: связность, обязательные поля, висящие ноды и т.д.
// Возвращает массив предупреждений/ошибок, которые показываются в панели Logs.

import type { RuntimeState, RuntimeNode, RuntimeEdge } from './runtimeTypes'
import { createTranslator, SupportedLanguage } from '../i18n/index'

import { NODE_REGISTRY } from './nodes/nodeRegistry'

// Контекст ресурсов проекта для расширенной валидации.
export type ValidationContext = {
  // Язык интерфейса ('en' | 'ru').
  language?: SupportedLanguage
  // Список объектов из .yyp (для проверки actor_create.key, target и т.д.).
  objects?: string[]
  // Список спрайтов из .yyp.
  sprites?: string[]
  // Список звуков из .yyp.
  sounds?: string[]
  // Yarn-файлы: имя файла → список нод внутри.
  yarnFiles?: Map<string, string[]>
  // Whitelist функций из cutscene_engine_settings.json.
  runFunctions?: string[]
  // Whitelist условий для branch.
  branchConditions?: string[]
}

// Уровень серьёзности:
// - error блокирует экспорт
// - warn — не блокирует, но важно
// - tip — рекомендация, полезный совет
export type ValidationSeverity = 'error' | 'warn' | 'tip'

// Одна запись валидации.
export type ValidationEntry = {
  ruleId?: string
  severity: ValidationSeverity
  defaultSeverity?: ValidationSeverity
  // ID ноды или ребра, к которому относится проблема (может быть null для глобальных).
  nodeId?: string
  edgeId?: string
  message: string
}

// Результат валидации: массив записей.
export type ValidationResult = {
  entries: ValidationEntry[]
  // Есть ли хотя бы одна ошибка (блокирующая экспорт)?
  hasErrors: boolean
}

// Какие параметры обязательны для каждого типа ноды.
// Ключ — тип ноды, значение — массив имён обязательных параметров.
const REQUIRED_PARAMS: Record<string, string[]> = {
  dialogue: [],
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
  // В движке ключ называется `function`.
  // `function_name` оставляем для обратной совместимости со старыми сценами.
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
  music_resume: []
}

// Главная функция валидации. Принимает текущее состояние графа и опциональный контекст ресурсов.
export function validateGraph(
  state: RuntimeState,
  context?: ValidationContext
): ValidationResult {
  const entries: ValidationEntry[] = []
  const { nodes, edges } = state

  // Создаём локализатор на основе языка из контекста (по умолчанию en).
  const t = createTranslator(context?.language ?? 'en')

  // --- 0. Проверяем имена нод (name) ---
  // Имя — это то, что видит пользователь на ноде и в списке.
  // Мы разрешаем дубликаты, но показываем предупреждение, потому что это путает.
  const nameToNodeIds = new Map<string, string[]>()
  for (const n of nodes) {
    const name = String(n.name ?? '').trim()
    if (!name) {
      // Пустое имя — это совет, не ошибка.
      entries.push({
        severity: 'tip',
        defaultSeverity: 'tip',
        ruleId: 'nodeNoName',
        nodeId: n.id,
        message: t('validation.nodeNoName', { id: n.id, type: n.type })
      })
      continue
    }
    const list = nameToNodeIds.get(name) ?? []
    list.push(n.id)
    nameToNodeIds.set(name, list)
  }

  for (const [name, ids] of nameToNodeIds.entries()) {
    if (ids.length <= 1) continue
    for (const id of ids) {
      // Имена-дубликаты — это лишь подсказка для порядка, а не критическая ошибка.
      entries.push({
        severity: 'tip',
        defaultSeverity: 'tip',
        ruleId: 'duplicateName',
        nodeId: id,
        message: t('validation.duplicateName', { name, count: ids.length })
      })
    }
  }

  // --- 1. Проверяем наличие start и end нод ---
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')

  if (startNodes.length === 0) {
    entries.push({ severity: 'error', defaultSeverity: 'error', ruleId: 'missingStartNode', message: t('validation.missingStartNode') })
  }
  if (startNodes.length > 1) {
    entries.push({
      severity: 'error',
      defaultSeverity: 'error',
      ruleId: 'tooManyStartNodes',
      message: t('validation.tooManyStartNodes', { count: startNodes.length - 1 })
    })
  }
  if (endNodes.length === 0) {
    entries.push({ severity: 'error', defaultSeverity: 'error', ruleId: 'missingEndNode', message: t('validation.missingEndNode') })
  }

  // --- 2. Карты для быстрого доступа ---
  const nodeMap = new Map<string, RuntimeNode>()
  const actorKeys = new Set<string>()
  const markNodeNames = new Map<string, string[]>()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
    if (n.type === 'actor_create') {
      const key = String(n.params?.actor_name ?? '').trim()
      if (key) actorKeys.add(key)
    }
    if (n.type === 'spawn_entity') {
      const key = String(n.params?.key ?? '').trim()
      if (key) actorKeys.add(key)
    }
    if (n.type === 'mark_node') {
      const name = String(n.params?.name ?? '').trim()
      if (name) {
        const list = markNodeNames.get(name) ?? []
        list.push(n.id)
        markNodeNames.set(name, list)
      }
    }
  }

  // Дубликаты имён mark_node — jump не сможет однозначно выбрать цель.
  for (const [name, ids] of markNodeNames.entries()) {
    if (ids.length <= 1) continue
    for (const id of ids) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'duplicateMarkerName',
        nodeId: id,
        message: t('validation.duplicateMarkerName', { name, count: ids.length })
      })
    }
  }

  // Входящие и исходящие рёбра для каждой ноды (без internal __pair рёбер).
  // Предвычисляем один раз, чтобы не фильтровать внутри цикла по нодам.
  const inEdges = new Map<string, RuntimeEdge[]>()
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    const isPair = e.sourceHandle === '__pair' && e.targetHandle === '__pair'
    if (!isPair) {
      inEdges.set(e.target, [...(inEdges.get(e.target) ?? []), e])
      outEdges.set(e.source, [...(outEdges.get(e.source) ?? []), e])
    }
  }

  // --- 3. Проверяем каждую ноду ---
  for (const node of nodes) {
    const incoming = inEdges.get(node.id) ?? []
    const outgoing = outEdges.get(node.id) ?? []

    // start не должен иметь входящих рёбер.
    if (node.type === 'start' && incoming.length > 0) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'startHasIncomingEdges',
        nodeId: node.id,
        message: t('validation.startIncomingConnections')
      })
    }

    // start должен иметь хотя бы один выход.
    if (node.type === 'start' && outgoing.length === 0) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'startHasNoOutgoingEdges',
        nodeId: node.id,
        message: t('validation.startNoOutgoing')
      })
    }

    // end не должен иметь исходящих рёбер.
    if (node.type === 'end' && outgoing.length > 0) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'endHasOutgoingEdges',
        nodeId: node.id,
        message: t('validation.endOutgoingConnections')
      })
    }

    // Висящая нода: нет ни входящих, ни исходящих (кроме start/end).
    const nodeDisplayName = node.name && node.name.length > 0 ? `"${node.name}"` : t('validation.unnamedNode', { type: node.type })
    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
      if (incoming.length === 0 && outgoing.length === 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'orphanNode',
          nodeId: node.id,
          message: t('validation.nodeIsolated', { name: nodeDisplayName })
        })
      } else if (incoming.length === 0 && node.type !== 'parallel_start') {
        // Нода без входящих — до неё нельзя добраться от start.
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'unreachableNode',
          nodeId: node.id,
          message: t('validation.nodeUnreachable', { name: nodeDisplayName })
        })
      }
    }

    // Обычная нода (не branch, не parallel_start) не должна иметь > 1 исходящего ребра.
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

    // --- 4. Проверяем обязательные параметры ---
    const requiredFields = REQUIRED_PARAMS[node.type]
    if (requiredFields) {
      const nodeDef = NODE_REGISTRY[node.type]
      for (const fieldKey of requiredFields) {
        const value = node.params?.[fieldKey]
        if (value === undefined || value === null || value === '') {
          // Ищем label для поля в registry, чтобы сообщение было понятнее пользователю.
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

    // actor_create: если нет ни actor_sprite, ни copy_target — предупреждаем.
    // Движок подставит дефолтный obj_actor, но пользователь скорее всего забыл заполнить.
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

    // branch: если нет false-ветки — это tip (не ошибка, но может быть забыто).
    if (node.type === 'branch') {
      const outgoing = outEdges.get(node.id) ?? []
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

    // wait_until: condition_var обязательна, timeout не может быть отрицательным.
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

    if (node.type === 'tween') {
      const kind = String(node.params?.kind ?? 'instance').trim()
      const target = String(node.params?.target ?? '').trim()
      const property = String(node.params?.prop ?? node.params?.property ?? node.params?.field ?? '').trim()
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

    if (node.type === 'set_property') {
      const kind = String(node.params?.kind ?? 'instance').trim()
      const target = String(node.params?.target ?? '').trim()
      const property = String(node.params?.prop ?? node.params?.property ?? node.params?.field ?? '').trim()
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

    // run_function: отдельно проверяем имя функции.
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

      // Args: в UI это строка JSON. Если JSON битый — предупреждаем.
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

    // --- 5. Дополнительные best-practice проверки ---
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

    // camera_shake / shake_object: проверяем seconds, frequency и magnitudes.
    if (node.type === 'camera_shake' || node.type === 'shake_object') {
      const seconds = Number(node.params?.seconds ?? 0)
      if (seconds <= 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'waitInvalidSeconds',
          nodeId: node.id,
          message: t('validation.cameraShakeSecondsInvalid', { name: nodeDisplayName })
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

    if (node.type === 'follow_path') {
      // Исправлено: было node.params?.path (неверное имя поля), должно быть points
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

    if (node.type === 'halt') {
      const hasOutgoing = (outEdges.get(node.id) ?? []).length > 0
      if (hasOutgoing) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'haltHasOutgoingEdges',
          nodeId: node.id,
          message: t('validation.haltHasOutgoing', { name: nodeDisplayName })
        })
      }
    }

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

    if (node.type === 'set_facing') {
      const direction = String(node.params?.direction ?? '').trim().toLowerCase()
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
    }

    // Actor target resolution: target должен ссылаться на 'player' или actor_create.key в этом графе.
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

    // --- 6. Проверяем parallel_start ↔ parallel_join пару ---
    if (node.type === 'parallel_start') {
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      const branches = Array.isArray(node.params?.branches)
        ? (node.params?.branches as string[])
        : ['b0']
      if (!joinId) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'parallelStartMissingJoin',
          nodeId: node.id,
          message: t('validation.parallelStartMissingJoin', { id: node.id })
        })
      } else if (!nodeMap.has(joinId)) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'parallelStartJoinMissing',
          nodeId: node.id,
          message: t('validation.parallelStartJoinMissing', { id: node.id })
        })
      } else {
        const joinNode = nodeMap.get(joinId)
        if (joinNode?.type !== 'parallel_join') {
          entries.push({
            severity: 'error',
            defaultSeverity: 'error',
            ruleId: 'parallelStartJoinNotJoin',
            nodeId: node.id,
            message: t('validation.parallelStartJoinNotJoin', { id: node.id })
          })
        }

        const joinPairId = typeof joinNode?.params?.pairId === 'string' ? joinNode.params.pairId : ''
        if (joinPairId && joinPairId !== node.id) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinMismatchedPairId',
            nodeId: node.id,
            message: t('validation.parallelStartJoinMismatch', { id: node.id, joinId })
          })
        }

        const joinBranches = Array.isArray(joinNode?.params?.branches)
          ? (joinNode?.params?.branches as string[])
          : ['b0']
        const sameBranchCount = joinBranches.length === branches.length
        const sameBranchSet =
          sameBranchCount &&
          branches.every((branchId) => joinBranches.includes(branchId)) &&
          joinBranches.every((branchId) => branches.includes(branchId))

        if (!sameBranchSet) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartJoinBranchMismatch',
            nodeId: node.id,
            message: t('validation.parallelStartJoinBranchMismatch', { id: node.id, joinId })
          })
        }
      }

      // Проверяем, что handle-ы совпадают с branches.
      // Это нужно, чтобы ветки не "терялись" при компиляции.
      const uniqueBranches = new Set(branches)
      if (uniqueBranches.size !== branches.length) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'parallelBranchDuplicate',
          nodeId: node.id,
          message: t('validation.parallelStartDuplicateBranchIds', { id: node.id })
        })
      }

      const outgoingEdges = outEdges.get(node.id) ?? []
      const outgoingHandleUsage = new Map<string, number>()

      for (const edge of outgoingEdges) {
        const handle = edge.sourceHandle
        if (!handle) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartMissingHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelStartEdgeNoSourceHandle', { id: node.id, edgeId: edge.id })
          })
          continue
        }

        if (!handle.startsWith('out_')) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartInvalidHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelStartEdgeUnexpectedHandle', { id: node.id, edgeId: edge.id, handle })
          })
          continue
        }

        outgoingHandleUsage.set(handle, (outgoingHandleUsage.get(handle) ?? 0) + 1)

        const branchId = handle.slice('out_'.length)
        if (!uniqueBranches.has(branchId)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartDisconnectedBranch',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelStartEdgeBranchNotListed', { id: node.id, branchId })
          })
        }
      }

      for (const [handle, count] of outgoingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelStartBranchMultipleEdges',
            nodeId: node.id,
            message: t('validation.parallelStartBranchMultipleEdges', { id: node.id, handle, count })
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = outgoingEdges.some((edge) => edge.sourceHandle === `out_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'tip',
            defaultSeverity: 'tip',
            ruleId: 'parallelStartBranchNotConnected',
            nodeId: node.id,
            message: t('validation.parallelStartBranchNoOutgoing', { id: node.id, branchId })
          })
        }
      }
    }

    if (node.type === 'parallel_join') {
      const pairId = typeof node.params?.pairId === 'string' ? node.params.pairId : ''
      const branches = Array.isArray(node.params?.branches)
        ? (node.params?.branches as string[])
        : ['b0']
      if (!pairId) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'parallelJoinMissingStart',
          nodeId: node.id,
          message: t('validation.parallelJoinNoPair', { id: node.id })
        })
      } else if (!nodeMap.has(pairId)) {
        entries.push({
          severity: 'error',
          defaultSeverity: 'error',
          ruleId: 'parallelJoinPairMissing',
          nodeId: node.id,
          message: t('validation.parallelJoinPairMissing', { id: node.id })
        })
      } else {
        const startNode = nodeMap.get(pairId)
        if (startNode?.type !== 'parallel_start') {
          entries.push({
            severity: 'error',
            defaultSeverity: 'error',
            ruleId: 'parallelJoinPairNotStart',
            nodeId: node.id,
            message: t('validation.parallelJoinPairNotStart', { id: node.id })
          })
        }

        const startJoinId = typeof startNode?.params?.joinId === 'string' ? startNode.params.joinId : ''
        if (startJoinId && startJoinId !== node.id) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinMismatchedPairId',
            nodeId: node.id,
            message: t('validation.parallelJoinPairMismatch', { id: node.id, pairId })
          })
        }

        const startBranches = Array.isArray(startNode?.params?.branches)
          ? (startNode?.params?.branches as string[])
          : ['b0']
        const sameBranchCount = startBranches.length === branches.length
        const sameBranchSet =
          sameBranchCount &&
          branches.every((branchId) => startBranches.includes(branchId)) &&
          startBranches.every((branchId) => branches.includes(branchId))

        if (!sameBranchSet) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinPairBranchMismatch',
            nodeId: node.id,
            message: t('validation.parallelJoinPairBranchMismatch', { id: node.id, pairId })
          })
        }
      }

      // Проверяем, что входящие handle-ы совпадают с branches.
      const uniqueBranches = new Set(branches)
      const incomingEdges = inEdges.get(node.id) ?? []
      const incomingHandleUsage = new Map<string, number>()

      for (const edge of incomingEdges) {
        const handle = edge.targetHandle
        if (!handle) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinEdgeNoTargetHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelJoinEdgeNoTargetHandle', { id: node.id, edgeId: edge.id })
          })
          continue
        }

        if (!handle.startsWith('in_')) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinEdgeUnexpectedHandle',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelJoinEdgeUnexpectedHandle', { id: node.id, edgeId: edge.id, handle })
          })
          continue
        }

        incomingHandleUsage.set(handle, (incomingHandleUsage.get(handle) ?? 0) + 1)

        const branchId = handle.slice('in_'.length)
        if (!uniqueBranches.has(branchId)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinEdgeBranchNotListed',
            nodeId: node.id,
            edgeId: edge.id,
            message: t('validation.parallelJoinEdgeBranchNotListed', { id: node.id, edgeId: edge.id, branchId })
          })
        }
      }

      for (const [handle, count] of incomingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'parallelJoinBranchMultipleEdges',
            nodeId: node.id,
            message: t('validation.parallelJoinBranchMultipleEdges', { id: node.id, handle, count })
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = incomingEdges.some((edge) => edge.targetHandle === `in_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'tip',
            defaultSeverity: 'tip',
            ruleId: 'parallelJoinBranchNoIncoming',
            nodeId: node.id,
            message: t('validation.parallelJoinBranchNoIncoming', { id: node.id, branchId })
          })
        }
      }
    }
  }

  // --- 7. Проверяем рёбра: source и target должны существовать ---
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'edgeMissingSource',
        edgeId: edge.id,
        message: t('validation.edgeMissingSource', { edgeId: edge.id, source: edge.source })
      })
    }
    if (!nodeMap.has(edge.target)) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'edgeMissingTarget',
        edgeId: edge.id,
        message: t('validation.edgeMissingTarget', { edgeId: edge.id, target: edge.target })
      })
    }

    // Отрицательный wait — ошибка.
    if (typeof edge.waitSeconds === 'number' && edge.waitSeconds < 0) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'edgeNegativeWait',
        edgeId: edge.id,
        message: t('validation.edgeNegativeWait', { edgeId: edge.id, count: edge.waitSeconds })
      })
    }

    // Условие на ребре: если включено, то переменная должна быть задана.
    if (edge.conditionEnabled) {
      const varName = String(edge.conditionVar ?? '').trim()
      const eq = String(edge.conditionEquals ?? '')

      if (!varName) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'edgeConditionVarEmpty',
          edgeId: edge.id,
          message: t('validation.edgeConditionVarEmpty', { edgeId: edge.id })
        })
      } else if (varName.startsWith('global.')) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'edgeConditionGlobalPrefix',
          edgeId: edge.id,
          message: t('validation.edgeConditionGlobalPrefix', { edgeId: edge.id })
        })
      }

      if (eq.trim().length === 0) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'edgeConditionEqualsEmpty',
          edgeId: edge.id,
          message: t('validation.edgeConditionEqualsEmpty', { edgeId: edge.id })
        })
      }

      // Проверяем поля для wait_until_true.
      if (edge.conditionIfFalse === 'wait_until_true') {
        const stopWhen = edge.stopWaitingWhen ?? 'none'

        // End-condition: global_var — нужны переменная и значение.
        if (stopWhen === 'global_var') {
          const endVar = String(edge.endConditionVar ?? '').trim()
          if (!endVar) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingEndVarEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingEndVarEmpty', { edgeId: edge.id })
            })
          } else if (endVar.startsWith('global.')) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingEndVarGlobalPrefix',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingEndVarGlobalPrefix', { edgeId: edge.id })
            })
          }
          if (String(edge.endConditionEquals ?? '').trim().length === 0) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingEndEqualsEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingEndEqualsEmpty', { edgeId: edge.id })
            })
          }
        }

        // End-condition: node_reached — нужно имя ноды.
        if (stopWhen === 'node_reached') {
          const nodeName = String(edge.endNodeName ?? '').trim()
          if (!nodeName) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingNodeNameEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingNodeNameEmpty', { edgeId: edge.id })
            })
          } else {
            // Проверяем, что нода с таким именем существует.
            const found = nodes.some((n) => String(n.name ?? '').trim() === nodeName)
            if (!found) {
              entries.push({
                severity: 'warn',
                defaultSeverity: 'warn',
                ruleId: 'edgeStopWaitingNodeNotFound',
                edgeId: edge.id,
                message: t('validation.edgeStopWaitingNodeNotFound', { edgeId: edge.id, nodeName })
              })
            }
          }
        }

        // End-condition: timeout — нужно число > 0.
        if (stopWhen === 'timeout') {
          const timeoutVal = edge.endTimeoutSeconds
          if (typeof timeoutVal !== 'number' || timeoutVal <= 0) {
            entries.push({
              severity: 'warn',
              defaultSeverity: 'warn',
              ruleId: 'edgeStopWaitingTimeoutEmpty',
              edgeId: edge.id,
              message: t('validation.edgeStopWaitingTimeoutEmpty', { edgeId: edge.id })
            })
          }
        }
      }
    }
  }

  // --- 8. Проверяем достижимость от start (BFS) ---
  if (startNodes.length === 1) {
    const reachable = new Set<string>()
    const queue = [startNodes[0].id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)

      // Идём по исходящим рёбрам (включая __pair для parallel).
      const outs = outEdges.get(current) ?? []
      for (const e of outs) {
        if (!reachable.has(e.target)) queue.push(e.target)
      }
    }

    // Ноды, до которых нельзя добраться от start.
    const unreachableNodes = nodes.filter((n) => !reachable.has(n.id))
    if (unreachableNodes.length > 0) {
      entries.push({
        severity: 'warn',
        defaultSeverity: 'warn',
        ruleId: 'unreachableNodes',
        message: t('validation.unreachableNodes', { count: unreachableNodes.length })
      })
    }

    // Проверяем, что хотя бы одна end-нода достижима.
    const reachableEnd = endNodes.some((n) => reachable.has(n.id))
    if (!reachableEnd && endNodes.length > 0) {
      entries.push({
        severity: 'error',
        defaultSeverity: 'error',
        ruleId: 'noEndNodeReachable',
        message: t('validation.noEndNodeReachable')
      })
    }
  }

  // --- 9. Расширенная валидация с контекстом ресурсов ---
  if (context) {
    const allResources = [...(context.objects ?? []), ...(context.sprites ?? [])]

    for (const node of nodes) {
      const params = node.params ?? {}

      // Проверка actor_create.key — должен быть в списке объектов/спрайтов.
      if (node.type === 'actor_create') {
        const key = String(params.key ?? '').trim()
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

      // Проверка dialogue.file — должен быть в списке yarn-файлов.
      if (node.type === 'dialogue' && context.yarnFiles) {
        const file = String(params.file ?? '').trim()
        if (file) {
          // Убираем расширение .yarn если есть.
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
            // Проверка dialogue.node — должен быть в списке нод внутри файла.
            const nodeName = String(params.node ?? '').trim()
            if (nodeName) {
              const yarnNodes = context.yarnFiles.get(file) ?? context.yarnFiles.get(file + '.yarn') ?? []
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

      // Проверка run_function.function — должна быть в whitelist.
      if (node.type === 'run_function' && context.runFunctions) {
        const funcName = String(params.function ?? params.function_name ?? '').trim()
        if (funcName && context.runFunctions.length > 0 && !context.runFunctions.includes(funcName)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'runFunctionNotWhitelisted',
            nodeId: node.id,
            message: t('validation.runFunctionNotWhitelisted', { funcName })
          })
        }
      }

      // Проверка branch.condition — должна быть в whitelist.
      if (node.type === 'branch' && context.branchConditions) {
        const cond = String(params.condition ?? '').trim()
        if (cond && context.branchConditions.length > 0 && !context.branchConditions.includes(cond)) {
          entries.push({
            severity: 'warn',
            defaultSeverity: 'warn',
            ruleId: 'branchConditionNotWhitelisted',
            nodeId: node.id,
            message: t('validation.branchConditionNotWhitelisted', { cond })
          })
        }
      }

      // Проверка animate.sprite — должен быть в списке спрайтов.
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
    }
  }

  // --- 10. Continuity Checker MVP ---
  const createdActorsBefore = new Set<string>()
  const hasPlayMusicBefore = new Set<number>()

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    // actorUsedBeforeCreated: проверяем, что актёр создан до использования.
    if (node.type === 'actor_create') {
      const key = String(node.params?.actor_name ?? '').trim()
      if (key) createdActorsBefore.add(key)
    }
    if (node.type === 'spawn_entity') {
      const key = String(node.params?.key ?? '').trim()
      if (key) createdActorsBefore.add(key)
    }

    // musicActionWithoutMusic: отмечаем, что play_music был.
    if (node.type === 'play_music') {
      hasPlayMusicBefore.add(i)
    }

    const actorTargetTypesContinuity = new Set([
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
    if (actorTargetTypesContinuity.has(node.type)) {
      const target = String(node.params?.target ?? '').trim()
      if (target && target !== 'player' && !createdActorsBefore.has(target)) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'actorUsedBeforeCreated',
          nodeId: node.id,
          message: t('validation.actorUsedBeforeCreated', { target })
        })
      }
    }
  }

  // branchWithoutFalseConnection: проверяем, что у branch есть false-ветка.
  for (const node of nodes) {
    if (node.type === 'branch') {
      const outgoing = outEdges.get(node.id) ?? []
      const hasFalse = outgoing.some((e) => e.sourceHandle === 'out_false')
      if (!hasFalse) {
        entries.push({
          severity: 'tip',
          defaultSeverity: 'tip',
          ruleId: 'branchWithoutFalseConnection',
          nodeId: node.id,
          message: t('validation.branchWithoutFalseConnection')
        })
      }
    }
  }

  // musicActionWithoutMusic: проверяем, что перед music_volume/music_duck/music_unduck был play_music.
  let playMusicSeen = false
  for (const node of nodes) {
    if (node.type === 'play_music') {
      playMusicSeen = true
    }
    if (node.type === 'music_volume' || node.type === 'music_duck' || node.type === 'music_unduck' || node.type === 'music_pitch' || node.type === 'music_pause' || node.type === 'music_resume') {
      if (!playMusicSeen) {
        entries.push({
          severity: 'tip',
          defaultSeverity: 'tip',
          ruleId: 'musicActionWithoutMusic',
          nodeId: node.id,
          message: t('validation.musicActionWithoutMusic')
        })
      }
    }
  }

  // cameraTrackMissingTarget: проверяем, что у camera_track/camera_track_until_stop задан target.
  for (const node of nodes) {
    if (node.type === 'camera_track' || node.type === 'camera_track_until_stop') {
      const target = String(node.params?.target ?? '').trim()
      if (!target) {
        entries.push({
          severity: 'warn',
          defaultSeverity: 'warn',
          ruleId: 'cameraTrackMissingTarget',
          nodeId: node.id,
          message: t('validation.cameraTrackMissingTarget')
        })
      }
    }
  }

  return {
    entries,
    hasErrors: entries.some((e) => e.severity === 'error')
  }
}
