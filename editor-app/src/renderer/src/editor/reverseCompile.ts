import type { RuntimeEdge, RuntimeNode, RuntimeState } from './runtimeTypes'

// reverseCompile.ts — reverse-import engine JSON -> editor graph.
// Восстанавливаем editor-ноды из exported actions[], чтобы .json движка можно было
// снова открыть в Undefscene и продолжить править как обычную сцену.
//
// В этом импортере поддерживаются:
// - линейные цепочки действий
// - wait на рёбрах
// - guard_global как edge condition
// - mark_node как name следующей ноды
// - branch
// - parallel

// Action из экспортированного engine JSON.
export type ImportedAction = {
  type: string
  [key: string]: unknown
}

// Формат engine export, который делает stripExport().
export type ImportedCutscene = {
  schema_version: 1
  cutscene_id?: string
  settings?: {
    fps?: number
  }
  actions: ImportedAction[]
}

// Результат reverse-compile.
export type ReverseCompileResult =
  | {
      ok: true
      state: RuntimeState
      warnings: string[]
    }
  | {
      ok: false
      error: string
    }

// Edge patch — временные данные, которые должны попасть на следующее ребро.
type PendingEdgePatch = Partial<RuntimeEdge>

// Builder-контекст reverse-compile.
// Здесь храним все создаваемые ноды/рёбра и счётчик ID.
type ImportContext = {
  // Уже собранные ноды.
  nodes: RuntimeNode[]

  // Уже собранные рёбра.
  edges: RuntimeEdge[]

  // Счётчик для уникальных id.
  serial: number
}

// Одна входная/выходная точка последовательности.
// Через неё мы можем подключать продолжение цепочки,
// а также хранить sourceHandle/targetHandle и отложенный edge patch.
type SourceEndpoint = {
  nodeId: string
  sourceHandle?: string
  targetHandle?: string
  edgePatch?: PendingEdgePatch
}

// Внутренний результат импорта последовательности.
type SequenceImportResult =
  | {
      ok: true
      sources: SourceEndpoint[]
      nextX: number
      pendingNodeName: string | null
    }
  | {
      ok: false
      error: string
    }

// Проверяем, похож ли объект на engine export format.
export function isExportedCutscene(raw: unknown): raw is ImportedCutscene {
  if (!raw || typeof raw !== 'object') return false
  const candidate = raw as Partial<ImportedCutscene>
  return candidate.schema_version === 1 && Array.isArray(candidate.actions)
}

// Главная функция reverse-compile.
export function reverseCompileCutscene(raw: unknown): ReverseCompileResult {
  if (!isExportedCutscene(raw)) {
    return { ok: false, error: 'Unsupported cutscene format.' }
  }

  const title =
    typeof raw.cutscene_id === 'string' && raw.cutscene_id.trim().length > 0
      ? raw.cutscene_id
      : 'Imported Cutscene'

  const startNode: RuntimeNode = {
    id: 'import-start',
    type: 'start',
    name: 'Start',
    position: { x: 80, y: 200 }
  }

  const context: ImportContext = {
    nodes: [startNode],
    edges: [],
    serial: 0
  }

  const importResult = importSequence(raw.actions, context, [{ nodeId: startNode.id }], 360, 200, null)
  if (!importResult.ok) {
    return importResult
  }

  const endNode: RuntimeNode = {
    id: 'import-end',
    type: 'end',
    name: importResult.pendingNodeName ?? 'End',
    position: { x: importResult.nextX, y: 200 }
  }

  context.nodes.push(endNode)
  connectSourcesToNode(context, importResult.sources, endNode.id)

  return {
    ok: true,
    state: {
      schemaVersion: 1,
      title,
      nodes: context.nodes,
      edges: context.edges,
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      lastSavedAtMs: 0
    },
    warnings: [
      'Imported engine JSON as a new editor scene. Use Save As to keep editor-only layout data.'
    ]
  }
}

// Рекурсивно импортируем последовательность действий.
// На вход приходят текущие источники, от которых пойдёт следующий action.
// На выходе — новые "хвосты" графа, к которым можно подключать продолжение.
function importSequence(
  actions: ImportedAction[],
  context: ImportContext,
  initialSources: SourceEndpoint[],
  startX: number,
  baseY: number,
  initialPendingNodeName: string | null
): SequenceImportResult {
  let sources = initialSources
  let nextX = startX
  let pendingNodeName = initialPendingNodeName
  let pendingEdgePatch: PendingEdgePatch = {}

  for (const action of actions) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
      return { ok: false, error: 'Encountered invalid action while importing engine JSON.' }
    }

    // mark_node — это не отдельная нода. Это имя следующей реальной ноды.
    if (action.type === 'mark_node') {
      const nextName = typeof action.name === 'string' ? action.name.trim() : ''
      pendingNodeName = nextName || null
      continue
    }

    // wait в редакторе живёт на ребре, а не отдельной нодой.
    if (action.type === 'wait') {
      const seconds = Number(action.seconds)
      if (Number.isFinite(seconds) && seconds > 0) {
        pendingEdgePatch.waitSeconds = seconds
      }
      continue
    }

    // guard_global превращаем в edge condition на первое ребро вложенной цепочки.
    if (action.type === 'guard_global') {
      const nested = Array.isArray(action.actions) ? (action.actions as ImportedAction[]) : null
      if (!nested) {
        return { ok: false, error: 'guard_global action is missing nested actions.' }
      }

      const nestedSources = applyEdgePatchToSources(sources, pendingEdgePatch, guardToEdgePatch(action))
      pendingEdgePatch = {}

      const nestedResult = importSequence(
        nested,
        context,
        nestedSources,
        nextX,
        baseY,
        pendingNodeName
      )
      if (!nestedResult.ok) {
        return nestedResult
      }

      sources = nestedResult.sources
      nextX = nestedResult.nextX
      pendingNodeName = nestedResult.pendingNodeName
      continue
    }

    // branch восстанавливаем как отдельную branch-ноду и две независимые ветки.
    if (action.type === 'branch') {
      const mergedSources = applyEdgePatchToSources(sources, pendingEdgePatch)
      pendingEdgePatch = {}

      const branchNode = createNode(
        context,
        'branch',
        { condition: typeof action.condition === 'string' ? action.condition : '' },
        pendingNodeName,
        { x: nextX, y: baseY }
      )
      pendingNodeName = null

      context.nodes.push(branchNode)
      connectSourcesToNode(context, mergedSources, branchNode.id)

      const trueActions = Array.isArray(action.true_actions)
        ? (action.true_actions as ImportedAction[])
        : []
      const falseActions = Array.isArray(action.false_actions)
        ? (action.false_actions as ImportedAction[])
        : []

      const trueResult = importSequence(
        trueActions,
        context,
        [{ nodeId: branchNode.id, sourceHandle: 'out_true' }],
        nextX + 280,
        baseY - 180,
        null
      )
      if (!trueResult.ok) return trueResult

      const falseResult = importSequence(
        falseActions,
        context,
        [{ nodeId: branchNode.id, sourceHandle: 'out_false' }],
        nextX + 280,
        baseY + 180,
        null
      )
      if (!falseResult.ok) return falseResult

      sources = [...trueResult.sources, ...falseResult.sources]
      nextX = Math.max(trueResult.nextX, falseResult.nextX)
      pendingNodeName = null
      continue
    }

    // parallel восстанавливаем как пару parallel_start + parallel_join с ветками между ними.
    if (action.type === 'parallel') {
      const mergedSources = applyEdgePatchToSources(sources, pendingEdgePatch)
      pendingEdgePatch = {}

      const branchEntries = Array.isArray(action.actions)
        ? (action.actions as Array<ImportedAction | ImportedAction[]>)
        : []

      const branchIds =
        branchEntries.length > 0
          ? branchEntries.map((_entry, index) => `b${index}`)
          : ['b0']

      const joinId = nextNodeId(context, 'parallel_join')
      const startNode = createNode(
        context,
        'parallel_start',
        { joinId, branches: branchIds },
        pendingNodeName,
        { x: nextX, y: baseY }
      )
      pendingNodeName = null
      context.nodes.push(startNode)
      connectSourcesToNode(context, mergedSources, startNode.id)

      let branchMaxX = nextX + 280
      const branchTails: Array<{ sources: SourceEndpoint[]; branchId: string }> = []

      branchIds.forEach((branchId, index) => {
        const entry = branchEntries[index]
        const branchActions = Array.isArray(entry)
          ? (entry as ImportedAction[])
          : entry
            ? [entry as ImportedAction]
            : []

        const branchBaseY = baseY + (index - (branchIds.length - 1) / 2) * 180
        const branchResult = importSequence(
          branchActions,
          context,
          [{ nodeId: startNode.id, sourceHandle: `out_${branchId}` }],
          nextX + 280,
          branchBaseY,
          null
        )

        if (!branchResult.ok) {
          throw new Error(branchResult.error)
        }

        branchMaxX = Math.max(branchMaxX, branchResult.nextX)
        branchTails.push({ sources: branchResult.sources, branchId })
      })

      const joinNode: RuntimeNode = {
        id: joinId,
        type: 'parallel_join',
        name: defaultNodeName('parallel_join', context.serial),
        position: { x: Math.max(branchMaxX, nextX + 560), y: baseY },
        params: {
          pairId: startNode.id,
          branches: branchIds
        }
      }
      context.nodes.push(joinNode)

      for (const branchTail of branchTails) {
        connectSourcesToNode(
          context,
          branchTail.sources.map((source) => ({
            ...source,
            targetHandle: `in_${branchTail.branchId}`
          })),
          joinNode.id
        )
      }

      sources = [{ nodeId: joinNode.id }]
      nextX = (joinNode.position?.x ?? nextX) + 280
      pendingNodeName = null
      continue
    }

    // Обычное action → обычная editor node.
    const mergedSources = applyEdgePatchToSources(sources, pendingEdgePatch)
    pendingEdgePatch = {}

    const node = actionToRuntimeNode(action, context, pendingNodeName, { x: nextX, y: baseY })
    pendingNodeName = null
    context.nodes.push(node)
    connectSourcesToNode(context, mergedSources, node.id)

    sources = [{ nodeId: node.id }]
    nextX += 280
  }

  if (Object.keys(pendingEdgePatch).length > 0) {
    sources = applyEdgePatchToSources(sources, pendingEdgePatch)
  }

  return { ok: true, sources, nextX, pendingNodeName }
}

// Создаём обычную editor node из action.
function actionToRuntimeNode(
  action: ImportedAction,
  context: ImportContext,
  pendingNodeName: string | null,
  position: { x: number; y: number }
): RuntimeNode {
  const rawType = String(action.type ?? '')
  const normalizedType =
    rawType === 'fadein'
      ? 'fade_in'
      : rawType === 'fadeout'
        ? 'fade_out'
        : rawType === 'sfx'
          ? 'play_sfx'
          : rawType === 'shakeobj'
            ? 'shake_object'
            : rawType === 'visible'
              ? 'set_visible'
              : rawType === 'waittalk'
                ? 'wait_for_dialogue'
                : rawType === 'set_instant'
                  ? 'instant_mode'
                  : rawType

  const nodeId = nextNodeId(context, normalizedType)
  const params: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(action)) {
    if (key === 'type') continue
    if (normalizedType === 'play_sfx' && key === 'key' && action.sound === undefined) {
      params.sound = value
      continue
    }
    if (normalizedType === 'tween' && key === 'target_kind' && action.kind === undefined) {
      params.kind = value
      continue
    }
    if (normalizedType === 'set_property' && key === 'target_kind' && action.kind === undefined) {
      params.kind = value
      continue
    }
    if (normalizedType === 'set_property' && key === 'field' && action.property === undefined) {
      params.property = value
      continue
    }
    if (normalizedType === 'set_property' && key === 'value') {
      params.value = typeof value === 'string' ? value : JSON.stringify(value)
      continue
    }
    if (normalizedType === 'set_visible' && key === 'enabled' && action.visible === undefined) {
      params.visible = value
      continue
    }
    if (normalizedType === 'instant_mode' && key === 'enabled') {
      params.enabled = value
      continue
    }
    params[key] = value
  }

  return {
    id: nodeId,
    type: normalizedType,
    name: pendingNodeName ?? defaultNodeName(normalizedType, context.serial),
    text: normalizedType === 'dialogue' ? '' : undefined,
    position,
    params
  }
}

// Создаём node с уже готовыми params и позицией.
function createNode(
  context: ImportContext,
  type: string,
  params: Record<string, unknown>,
  pendingNodeName: string | null,
  position: { x: number; y: number }
): RuntimeNode {
  return {
    id: nextNodeId(context, type),
    type,
    name: pendingNodeName ?? defaultNodeName(type, context.serial),
    position,
    params
  }
}

// Подключаем один или несколько source endpoints к указанной target node.
function connectSourcesToNode(
  context: ImportContext,
  sources: SourceEndpoint[],
  targetNodeId: string
): void {
  for (const source of sources) {
    context.edges.push({
      id: nextEdgeId(context),
      source: source.nodeId,
      sourceHandle: source.sourceHandle,
      target: targetNodeId,
      targetHandle: source.targetHandle,
      ...(source.edgePatch ?? {})
    })
  }
}

// Навешиваем edge patch на текущие source endpoints.
// Это используется для wait/guard перед следующим реальным переходом.
function applyEdgePatchToSources(
  sources: SourceEndpoint[],
  ...patches: Array<PendingEdgePatch | undefined>
): SourceEndpoint[] {
  const mergedPatch = mergeEdgePatches(...patches)
  if (Object.keys(mergedPatch).length === 0) return sources

  return sources.map((source) => ({
    ...source,
    edgePatch: mergeEdgePatches(source.edgePatch, mergedPatch)
  }))
}

// Аккуратно объединяем несколько patch-объектов в один.
function mergeEdgePatches(...patches: Array<PendingEdgePatch | undefined>): PendingEdgePatch {
  const result: PendingEdgePatch = {}

  for (const patch of patches) {
    if (!patch) continue
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        ;(result as Record<string, unknown>)[key] = value
      }
    }
  }

  return result
}

// Генерируем id ноды по типу, чтобы imported graph было легче читать в raw JSON.
function nextNodeId(context: ImportContext, type: string): string {
  const normalizedType = String(type || 'node').replace(/[^a-z0-9_]+/gi, '_').toLowerCase()
  return `import-${normalizedType}-${context.serial++}`
}

// Переводим guard_global в поля editor edge condition.
function guardToEdgePatch(action: ImportedAction): PendingEdgePatch {
  const ifFalse = action.if_false === 'wait_until_true' ? 'wait_until_true' : 'skip'
  const stopWhen =
    action.stop_when === 'global_var' ||
    action.stop_when === 'node_reached' ||
    action.stop_when === 'timeout'
      ? action.stop_when
      : 'none'

  return {
    conditionEnabled: true,
    conditionVar: typeof action.var === 'string' ? stripGlobalPrefix(action.var) : '',
    conditionEquals: stringifyValue(action.equals),
    conditionIfFalse: ifFalse,
    stopWaitingWhen: stopWhen,
    endConditionVar:
      typeof action.end_var === 'string' ? stripGlobalPrefix(action.end_var) : undefined,
    endConditionEquals:
      action.end_equals !== undefined ? stringifyValue(action.end_equals) : undefined,
    endNodeName: typeof action.end_node === 'string' ? action.end_node : undefined,
    endTimeoutSeconds:
      typeof action.end_timeout === 'number' && action.end_timeout > 0
        ? action.end_timeout
        : undefined
  }
}

// Генерируем id для рёбер последовательно, чтобы импорт был стабильнее и читабельнее.
function nextEdgeId(context: ImportContext): string {
  return `import-edge-${context.serial++}`
}

// Дефолтное имя ноды, если mark_node отсутствовал.
function defaultNodeName(type: string, serial: number): string {
  const normalized = String(type || 'node').replace(/[_-]+/g, ' ').trim()
  const label = normalized.length > 0 ? normalized : 'Node'
  return `${label} ${serial}`
}

// Приводим значения к строке так же, как это делает editor edge condition UI.
function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

// Если в JSON случайно лежит global.foo, в editor храним только foo.
function stripGlobalPrefix(value: string): string {
  return value.startsWith('global.') ? value.slice('global.'.length) : value
}
