// compileGraph.ts — Компилятор графа нод → плоский actions[] для движка.
// Обходит граф от start-ноды до end, формируя массив действий.
// Поддерживает: parallel (вложенные ветки), branch (true/false), wait (с рёбер).

import type { RuntimeEdge, RuntimeNode, RuntimeState } from './runtimeTypes'

// Локальный тип translator — точно соответствует createTranslator,
// чтобы не тянуть зависимость и избежать mismatch при strictFunctionTypes.
export type Translator = (
  key: string,
  fallbackOrParams?: string | Record<string, string | number | undefined>,
  maybeFallback?: string
) => string

// Тип одного действия в экспортированном JSON.
export type CompiledAction = {
  type: string
  [key: string]: unknown
}

// Результат компиляции: либо успех с actions[], либо ошибка.
export type CompileResult = { ok: true; actions: CompiledAction[] } | { ok: false; error: string }

// Результат strip-export: чистый JSON для движка.
export type ExportedCutscene = {
  schema_version: 1
  cutscene_id: string
  settings: {
    fps: number
  }
  actions: CompiledAction[]
}

// Компилируем граф в плоский массив actions[].
// Алгоритм: DFS от start-ноды, следуя по рёбрам.
export function compileGraph(state: RuntimeState, t?: Translator): CompileResult {
  // Если translator не передан — fallback на оригинальный английский текст.
  const _t: Translator = t ?? ((key, fallbackOrParams, _maybeFallback) => (typeof fallbackOrParams === 'string' ? fallbackOrParams : key))
  const { nodes, edges } = state

  // Ищем стартовую ноду.
  const startNode = nodes.find((n) => n.type === 'start')
  if (!startNode) {
    return { ok: false, error: _t('compileGraph.noStartNode', 'No "start" node found in the graph.') }
  }

  // Проверяем, что есть хотя бы одна end-нода.
  const hasEnd = nodes.some((n) => n.type === 'end')
  if (!hasEnd) {
    return { ok: false, error: _t('compileGraph.noEndNode', 'No "end" node found in the graph.') }
  }

  // Карта нод по ID для быстрого доступа.
  const nodeMap = new Map<string, RuntimeNode>()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
  }

  // Карта исходящих рёбер: nodeId → список рёбер.
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    let list = outEdges.get(e.source)
    if (!list) {
      list = []
      outEdges.set(e.source, list)
    }
    list.push(e)
  }

  // Множество посещённых нод — защита от бесконечных циклов.
  const visited = new Set<string>()

  // Cache for normalized node names to avoid duplicate computations
  const nodeNameCache = new Map<string, string>()

  // Function to get normalized node name with caching
  function getNormalizedNodeName(node: RuntimeNode): string {
    if (nodeNameCache.has(node.id)) {
      return nodeNameCache.get(node.id)!
    }
    const name = String(node.name ?? '').trim()
    nodeNameCache.set(node.id, name)
    return name
  }

  // Function to filter edges (excludes internal __pair edges of parallel)
  // Returns filtered array without creating temporary objects in loops
  function filterRegularEdges(edges: RuntimeEdge[]): RuntimeEdge[] {
    const result: RuntimeEdge[] = []
    for (const edge of edges) {
      if (edge.sourceHandle !== '__pair' && edge.targetHandle !== '__pair') {
        result.push(edge)
      }
    }
    return result
  }

  // Создаём action-обёртку, которая запускает вложенные actions только если условие true.
  // Сейчас условие читаем ТОЛЬКО из global переменных.
  // Поддерживаем два режима: skip (пропустить) и wait_until_true (ждать).
  function wrapWithEdgeCondition(edge: RuntimeEdge, inner: CompiledAction[]): CompiledAction[] {
    if (!edge.conditionEnabled) return inner

    const rawVar = String(edge.conditionVar ?? '').trim()
    const equals = String(edge.conditionEquals ?? '')

    if (!rawVar) return inner

    // Убираем "global." если пользователь случайно вставил.
    const varName = rawVar.startsWith('global.') ? rawVar.slice('global.'.length) : rawVar

    const ifFalse = edge.conditionIfFalse ?? 'skip'

    const guard: CompiledAction = {
      type: 'guard_global',
      var: varName,
      equals,
      if_false: ifFalse,
      actions: inner
    }

    // Если wait_until_true — добавляем поля end-condition.
    if (ifFalse === 'wait_until_true') {
      const stopWhen = edge.stopWaitingWhen ?? 'none'
      guard.stop_when = stopWhen

      if (stopWhen === 'global_var') {
        const endVar = String(edge.endConditionVar ?? '').trim()
        const endVarClean = endVar.startsWith('global.') ? endVar.slice('global.'.length) : endVar
        if (endVarClean) {
          guard.end_var = endVarClean
          guard.end_equals = String(edge.endConditionEquals ?? '')
        }
      } else if (stopWhen === 'node_reached') {
        const nodeName = String(edge.endNodeName ?? '').trim()
        if (nodeName) {
          guard.end_node = nodeName
        }
      } else if (stopWhen === 'timeout') {
        if (typeof edge.endTimeoutSeconds === 'number' && edge.endTimeoutSeconds > 0) {
          guard.end_timeout = edge.endTimeoutSeconds
        }
      }
    }

    return [guard]
  }

  // Рекурсивный обход: собираем actions начиная с nodeId.
  function walkFrom(nodeId: string): CompileResult {
    // Защита от циклов.
    if (visited.has(nodeId)) {
      return { ok: false, error: _t('compileGraph.cycleDetected', { nodeId }, 'Cycle detected at node "{nodeId}". Cycles are not allowed.') }
    }
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) {
      return { ok: false, error: _t('compileGraph.nodeNotFound', { nodeId }, 'Node "{nodeId}" not found.') }
    }

    const actions: CompiledAction[] = []

    // Служебный action: говорим движку, что мы "дошли" до этой ноды.
    // Это нужно для stop_when = "node_reached".
    // Важно: используем именно node.name, потому что в UI end-node выбирается по имени.
    if (node.type !== 'parallel_join') {
      const nodeName = getNormalizedNodeName(node)
      if (nodeName) {
        actions.push({ type: 'mark_node', name: nodeName })
      }
    }

    // start и end не генерируют действий — это маркеры графа.
    if (node.type === 'start' || node.type === 'end') {
      // Для start — идём дальше по единственному выходу.
      if (node.type === 'start') {
        const next = getNextActions(nodeId)
        if (!next.ok) return next
        actions.push(...next.actions)
      }
      // end — конец цепочки, ничего не добавляем.
      return { ok: true, actions }
    }

    // parallel_start — собираем параллельные ветки.
    if (node.type === 'parallel_start') {
      const result = compileParallel(node)
      if (!result.ok) return result
      actions.push(...result.actions)

      // После parallel_join идём дальше.
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      if (joinId) {
        const afterJoin = getNextActions(joinId)
        if (!afterJoin.ok) return afterJoin
        actions.push(...afterJoin.actions)
      }

      return { ok: true, actions }
    }

    // parallel_join — не должен встречаться напрямую (обрабатывается через parallel_start).
    if (node.type === 'parallel_join') {
      return { ok: true, actions: [] }
    }

    // branch — генерируем ActionBranch с true_actions / false_actions.
    if (node.type === 'branch') {
      const result = compileBranch(node)
      if (!result.ok) return result
      actions.push(...result.actions)
      return { ok: true, actions }
    }


    // Обычная нода — генерируем действие из её параметров.
    const action = nodeToAction(node)
    actions.push(action)

    // Идём дальше по выходным рёбрам.
    const next = getNextActions(nodeId)
    if (!next.ok) return next
    actions.push(...next.actions)

    return { ok: true, actions }
  }

  // Получаем actions из следующих нод (по исходящим рёбрам).
  function getNextActions(nodeId: string): CompileResult {
    const outs = outEdges.get(nodeId) ?? []
    // Фильтруем внутренние рёбра parallel (handle __pair).
    const regularOuts = filterRegularEdges(outs)

    if (regularOuts.length === 0) {
      return { ok: true, actions: [] }
    }

    // Если одно исходящее ребро — линейный путь.
    if (regularOuts.length === 1) {
      const edge = regularOuts[0]
      const actions: CompiledAction[] = []

      // Если на ребре есть waitSeconds — добавляем wait-действие.
      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: edge.waitSeconds }

        // Условие на ребре влияет только на wait-таймер.
        // То есть: если condition false, мы просто пропускаем ожидание, но переход всё равно происходит.
        actions.push(...wrapWithEdgeCondition(edge, [waitAction]))
      }

      const next = walkFrom(edge.target)
      if (!next.ok) return next
      actions.push(...next.actions)
      return { ok: true, actions }
    }

    // Несколько исходящих рёбер — ошибка (кроме parallel/branch, которые обрабатываются отдельно).
    return {
      ok: false,
      error: _t('compileGraph.tooManyOutputs', { nodeId, count: regularOuts.length }, 'Node "{nodeId}" has {count} outgoing edges. Only parallel_start and branch can have multiple outputs.')
    }
  }

  // Компилируем parallel: собираем ветки между parallel_start и parallel_join.
  function compileParallel(startNode: RuntimeNode): CompileResult {
    const joinId = typeof startNode.params?.joinId === 'string' ? startNode.params.joinId : ''
    const branches = Array.isArray(startNode.params?.branches)
      ? (startNode.params.branches as string[])
      : ['b0']

    // Собираем исходящие рёбра parallel_start (кроме __pair).
    const outs = filterRegularEdges(outEdges.get(startNode.id) ?? [])

    // Важно: после обновления движка, ветка parallel может быть:
    // - одним action-объектом
    // - или sequence: массив action-объектов
    // Поэтому `actions` — это список, где каждый элемент = ветка.
    const parallelBranches: Array<CompiledAction | CompiledAction[]> = []

    for (const branchId of branches) {
      // В UI handles для parallel рисуются как `out_${branchId}` и `in_${branchId}`.
      const expectedSourceHandle = `out_${branchId}`

      // Ищем ребро с sourceHandle, совпадающим с нужной веткой.
      const edge = outs.find((e) => e.sourceHandle === expectedSourceHandle)
      if (!edge) {
        // Пустая ветка — допустимо, просто ничего не добавляем.
        continue
      }

      // Обходим ветку до parallel_join и получаем список действий.
      const branchResult = walkBranchUntil(edge.target, joinId)
      if (!branchResult.ok) return branchResult

      // Собираем sequence для этой ветки.
      // Если на ребре есть waitSeconds — делаем wait первым действием в sequence.
      const seq: CompiledAction[] = []
      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: edge.waitSeconds }
        // Условие на ребре влияет только на wait (если wait есть).
        seq.push(...wrapWithEdgeCondition(edge, [waitAction]))
      }

      seq.push(...branchResult.actions)

      // Если waitSeconds НЕТ, но condition включён — значит мы "гейтим" всю ветку.
      // То есть: ветка просто не запускается, если condition false.
      const shouldGateWholeBranch =
        edge.conditionEnabled && !(typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0)

      // Если в ветке ничего нет (ни wait, ни действий) — пропускаем.
      if (seq.length === 0) {
        continue
      }

      if (shouldGateWholeBranch) {
        parallelBranches.push(...wrapWithEdgeCondition(edge, seq))
        continue
      }

      // Если sequence из 1 элемента — можно хранить как один объект.
      // Если элементов больше — это sequence-массив.
      if (seq.length === 1) {
        parallelBranches.push(seq[0])
      } else {
        parallelBranches.push(seq)
      }
    }

    const parallelAction: CompiledAction = {
      type: 'parallel',
      // Ключ `actions` соответствует `cutscene_load_json.gml`.
      actions: parallelBranches
    }

    return { ok: true, actions: [parallelAction] }
  }

  // Обходим ветку до указанного stopNodeId (parallel_join).
  function walkBranchUntil(nodeId: string, stopNodeId: string): CompileResult {
    if (nodeId === stopNodeId) {
      return { ok: true, actions: [] }
    }

    if (visited.has(nodeId)) {
      return { ok: false, error: _t('compileGraph.cycleInParallel', { nodeId }, 'Cycle detected at node "{nodeId}" inside parallel branch.') }
    }
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) {
      return { ok: false, error: _t('compileGraph.nodeNotFoundInParallel', { nodeId }, 'Node "{nodeId}" not found in parallel branch.') }
    }

    const actions: CompiledAction[] = []

    // Служебный action: отмечаем достижение ноды.
    // В parallel ветках walkFrom не вызывается, поэтому дублируем логику здесь.
    if (node.type !== 'parallel_join') {
      const nodeName = getNormalizedNodeName(node)
      if (nodeName) {
        actions.push({ type: 'mark_node', name: nodeName })
      }
    }

    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
      actions.push(nodeToAction(node))
    }

    // Идём дальше.
    const outs = filterRegularEdges(outEdges.get(nodeId) ?? [])

    // Ветку parallel мы считаем “линейной”: в ней нельзя ветвиться.
    // И главное: ветка ДОЛЖНА дойти до join, иначе parallel не сможет корректно завершиться.
    if (outs.length === 0) {
      return {
        ok: false,
        error: _t('compileGraph.parallelDeadEnd', { nodeId, stopNodeId }, 'Parallel branch reached dead-end at node "{nodeId}" before join "{stopNodeId}".')
      }
    }

    if (outs.length > 1) {
      return {
        ok: false,
        error: _t('compileGraph.parallelSplit', { nodeId, count: outs.length }, 'Parallel branch has a split at node "{nodeId}" ({count} outgoing edges). Branches must be linear.')
      }
    }

    const edge = outs[0]
    const edgeActions: CompiledAction[] = []

    if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
      const waitAction: CompiledAction = { type: 'wait', seconds: edge.waitSeconds }

      // Внутри parallel ветки условие на ребре должно вести себя так же,
      // как и в остальном графе: если wait есть, guard влияет только на wait.
      edgeActions.push(...wrapWithEdgeCondition(edge, [waitAction]))
    }

    const next = walkBranchUntil(edge.target, stopNodeId)
    if (!next.ok) return next

    // Если wait на ребре нет, но condition включён,
    // значит нужно "загейтить" весь оставшийся хвост ветки после этого ребра.
    const shouldGateRemainingBranch =
      edge.conditionEnabled && !(typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0)

    if (shouldGateRemainingBranch) {
      if (next.actions.length > 0) {
        edgeActions.push(...wrapWithEdgeCondition(edge, next.actions))
      }
    } else {
      edgeActions.push(...next.actions)
    }

    actions.push(...edgeActions)

    return { ok: true, actions }
  }

  // Компилируем branch: condition → true_actions / false_actions.
  function compileBranch(node: RuntimeNode): CompileResult {
    const condition = typeof node.params?.condition === 'string' ? node.params.condition : ''

    const outs = filterRegularEdges(outEdges.get(node.id) ?? [])

    // Ищем рёбра по handle: out_true и out_false.
    const trueEdge = outs.find((e) => e.sourceHandle === 'out_true') ?? outs[0]
    const falseEdge = outs.find((e) => e.sourceHandle === 'out_false') ?? outs[1]

    const trueActions: CompiledAction[] = []
    const falseActions: CompiledAction[] = []

    if (trueEdge) {
      const edgeActions: CompiledAction[] = []

      if (typeof trueEdge.waitSeconds === 'number' && trueEdge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: trueEdge.waitSeconds }

        // Если на ребре есть wait, условие влияет только на сам wait,
        // а переход в ветку после этого остаётся обычным.
        edgeActions.push(...wrapWithEdgeCondition(trueEdge, [waitAction]))
      }

      const result = walkFrom(trueEdge.target)
      if (!result.ok) return result

      const shouldGateWholeTrueBranch =
        trueEdge.conditionEnabled && !(typeof trueEdge.waitSeconds === 'number' && trueEdge.waitSeconds > 0)

      if (shouldGateWholeTrueBranch) {
        if (result.actions.length > 0) {
          edgeActions.push(...wrapWithEdgeCondition(trueEdge, result.actions))
        }
      } else {
        edgeActions.push(...result.actions)
      }

      trueActions.push(...edgeActions)
    }

    if (falseEdge) {
      const edgeActions: CompiledAction[] = []

      if (typeof falseEdge.waitSeconds === 'number' && falseEdge.waitSeconds > 0) {
        const waitAction: CompiledAction = { type: 'wait', seconds: falseEdge.waitSeconds }

        // Для false-ветки используем ту же семантику,
        // чтобы поведение ребра не отличалось от true и от обычного графа.
        edgeActions.push(...wrapWithEdgeCondition(falseEdge, [waitAction]))
      }

      const result = walkFrom(falseEdge.target)
      if (!result.ok) return result

      const shouldGateWholeFalseBranch =
        falseEdge.conditionEnabled && !(typeof falseEdge.waitSeconds === 'number' && falseEdge.waitSeconds > 0)

      if (shouldGateWholeFalseBranch) {
        if (result.actions.length > 0) {
          edgeActions.push(...wrapWithEdgeCondition(falseEdge, result.actions))
        }
      } else {
        edgeActions.push(...result.actions)
      }

      falseActions.push(...edgeActions)
    }

    const branchAction: CompiledAction = {
      type: 'branch',
      condition,
      true_actions: trueActions,
      false_actions: falseActions
    }

    return { ok: true, actions: [branchAction] }
  }

  // Конвертируем обычную ноду в действие (action).
  function nodeToAction(node: RuntimeNode): CompiledAction {
    const action: CompiledAction = { type: node.type }

    // wait_until — синтаксический сахар для guard_global с if_false: 'wait_until_true'.
    if (node.type === 'wait_until') {
      const rawVar = String(node.params?.condition_var ?? '').trim()
      const varName = rawVar.startsWith('global.') ? rawVar.slice('global.'.length) : rawVar
      const equals = String(node.params?.condition_equals ?? '')
      const timeoutSeconds = Number(node.params?.timeout_seconds ?? 0)

      const guard: CompiledAction = {
        type: 'guard_global',
        var: varName,
        equals,
        if_false: 'wait_until_true',
        actions: []
      }

      if (timeoutSeconds > 0) {
        guard.stop_when = 'timeout'
        guard.end_timeout = timeoutSeconds
      } else {
        guard.stop_when = 'none'
      }

      return guard
    }

    // Спец-логика для run_function.
    // В движке ключ называется `function`, а в редакторе раньше использовался `function_name`.
    // Также `args` в UI хранится как строка JSON, а движок ждёт JSON-массив.
    if (node.type === 'run_function') {
      const fn =
        (typeof node.params?.function_name === 'string' && node.params.function_name) ||
        (typeof node.params?.function === 'string' && node.params.function) ||
        ''

      if (fn) action.function = fn

      const rawArgs = node.params?.args

      if (Array.isArray(rawArgs)) {
        action.args = rawArgs
      } else if (typeof rawArgs === 'string') {
        const trimmed = rawArgs.trim()
        if (trimmed.length > 0) {
          try {
            const parsed = JSON.parse(trimmed) as unknown
            if (Array.isArray(parsed)) {
              action.args = parsed
            } else {
              // Если пользователь ввёл не массив — оборачиваем в массив, чтобы движку было проще.
              action.args = [parsed]
            }
          } catch {
            // Если JSON битый — просто не добавляем args (валидация это подсветит отдельно).
          }
        }
      }

      return action
    }

    if (node.type === 'set_property') {
      const kind =
        (typeof node.params?.kind === 'string' && node.params.kind) ||
        (typeof node.params?.target_kind === 'string' && node.params.target_kind) ||
        'instance'
      const property =
        (typeof node.params?.prop === 'string' && node.params.prop) ||
        (typeof node.params?.property === 'string' && node.params.property) ||
        (typeof node.params?.field === 'string' && node.params.field) ||
        ''

      if (kind) action.kind = kind
      if (kind !== 'camera' && typeof node.params?.target === 'string' && node.params.target) {
        action.target = node.params.target
      }
      if (property) action.property = property

      const rawValue = node.params?.value
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim()
        if (trimmed.length > 0) {
          try {
            action.value = JSON.parse(trimmed) as unknown
          } catch {
            action.value = rawValue
          }
        }
      } else if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        action.value = rawValue
      }

      return action
    }

    if (node.type === 'partial_control') {
      if (typeof node.params?.control_type === 'number') action.control_type = node.params.control_type
      const rawWhitelist = node.params?.whitelist
      if (typeof rawWhitelist === 'string') {
        const trimmed = rawWhitelist.trim()
        if (trimmed.length > 0) {
          try {
            const parsed = JSON.parse(trimmed) as unknown
            action.whitelist = Array.isArray(parsed) ? parsed : [parsed]
          } catch {
            action.whitelist = trimmed.split(',').map((s) => s.trim())
          }
        } else {
          action.whitelist = []
        }
      } else if (Array.isArray(rawWhitelist)) {
        action.whitelist = rawWhitelist
      }
      return action
    }

    // schedule_action: формируем вложенный action-объект из action_type + action_params (JSON).
    // action_params пустой или битый JSON не ломает экспорт, но валидация покажет tip.
    if (node.type === 'schedule_action') {
      const delaySeconds = Number(node.params?.delay_seconds ?? 0)
      const actionType = typeof node.params?.action_type === 'string' ? node.params.action_type : ''
      const blocking = node.params?.blocking === true
      const tag = typeof node.params?.tag === 'string' ? node.params.tag : ''

      const innerAction: CompiledAction = { type: actionType }
      const rawParams = node.params?.action_params
      if (typeof rawParams === 'string') {
        const trimmed = rawParams.trim()
        if (trimmed.length > 0) {
          try {
            const parsed = JSON.parse(trimmed) as unknown
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
                if (k === 'type') continue
                innerAction[k] = v
              }
            }
          } catch {
            // Битый JSON игнорируем: validateGraph покажет подсказку пользователю.
          }
        }
      } else if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
        for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
          if (k === 'type') continue
          innerAction[k] = v
        }
      }

      action.delay_seconds = delaySeconds
      action.action = innerAction
      action.blocking = blocking
      if (tag) action.tag = tag
      return action
    }

    // checkpoint_state / restore_state — pass-through, JSON keys match field names.
    if (node.type === 'checkpoint_state' || node.type === 'restore_state') {
      if (typeof node.params?.checkpoint_id === 'string' && node.params.checkpoint_id) {
        action.checkpoint_id = node.params.checkpoint_id
      }
      if (typeof node.params?.include_actors === 'boolean') action.include_actors = node.params.include_actors
      if (typeof node.params?.include_player === 'boolean') action.include_player = node.params.include_player
      if (typeof node.params?.include_camera === 'boolean') action.include_camera = node.params.include_camera
      if (typeof node.params?.include_music === 'boolean') action.include_music = node.params.include_music
      const rawGlobals = node.params?.include_globals
      if (typeof rawGlobals === 'string' && rawGlobals.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawGlobals)
          if (Array.isArray(parsed)) action.include_globals = parsed
        } catch {
          // Invalid JSON ignored — validation will flag it.
        }
      }
      const rawInstances = node.params?.include_instances
      if (typeof rawInstances === 'string' && rawInstances.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawInstances)
          if (Array.isArray(parsed)) action.include_instances = parsed
        } catch {
          // Invalid JSON ignored — validation will flag it.
        }
      }
      if (typeof node.params?.cleanup_transients === 'boolean') action.cleanup_transients = node.params.cleanup_transients
      if (typeof node.params?.restore_camera === 'boolean') action.restore_camera = node.params.restore_camera
      if (typeof node.params?.restore_music === 'boolean') action.restore_music = node.params.restore_music
      if (typeof node.params?.on_missing === 'string') action.on_missing = node.params.on_missing
      return action
    }

    if (node.type === 'set_flag') {
      if (typeof node.params?.key === 'string' && node.params.key) action.key = node.params.key
      const rawVal = node.params?.value
      if (typeof rawVal === 'string') {
        const trimmed = rawVal.trim()
        if (trimmed.length > 0) {
          try {
            action.value = JSON.parse(trimmed) as unknown
          } catch {
            action.value = rawVal
          }
        }
      } else if (rawVal !== undefined) {
        action.value = rawVal
      }
      return action
    }

    // В UI Tween использует новые имена полей для соответствия GML параметрам.
    // Поддерживаем обратную совместимость со старыми именами полей.
    if (node.type === 'tween') {
      if (typeof node.params?.kind === 'string' && node.params.kind) action.kind = node.params.kind
      if (typeof node.params?.target === 'string' && node.params.target) action.target = node.params.target
      // property → prop
      if (typeof node.params?.prop === 'string' && node.params.prop) action.prop = node.params.prop
      else if (typeof node.params?.property === 'string' && node.params.property) action.prop = node.params.property
      // to → end_value
      if (typeof node.params?.end_value === 'number') action.end_value = node.params.end_value
      else if (typeof node.params?.to === 'number') action.end_value = node.params.to
      // from → start_value_override
      if (typeof node.params?.start_value_override === 'number') action.start_value_override = node.params.start_value_override
      else if (typeof node.params?.from === 'number') action.start_value_override = node.params.from
      // seconds → duration_frames
      if (typeof node.params?.duration_frames === 'number') action.duration_frames = node.params.duration_frames
      else if (typeof node.params?.seconds === 'number') action.duration_frames = node.params.seconds
      // easing → ease_name
      if (typeof node.params?.ease_name === 'string' && node.params.ease_name) action.ease_name = node.params.ease_name
      else if (typeof node.params?.easing === 'string' && node.params.easing) action.ease_name = node.params.easing
      return action
    }

    if (node.type === 'play_music') {
      if (typeof node.params?.sound === 'string' && node.params.sound) action.sound = node.params.sound
      if (typeof node.params?.volume === 'number') action.volume = node.params.volume
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'stop_music') {
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'music_volume') {
      if (typeof node.params?.volume === 'number') action.volume = node.params.volume
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'music_duck') {
      if (typeof node.params?.multiplier === 'number') action.multiplier = node.params.multiplier
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'music_unduck') {
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'music_pitch') {
      if (typeof node.params?.pitch === 'number') action.pitch = node.params.pitch
      return action
    }

    if (node.type === 'music_pause') {
      return action
    }

    if (node.type === 'music_resume') {
      return action
    }

    if (node.type === 'play_boss_music') {
      if (typeof node.params?.calm === 'string' && node.params.calm) action.calm = node.params.calm
      if (typeof node.params?.battle === 'string' && node.params.battle) action.battle = node.params.battle
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'stop_boss_music') {
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'boss_music_phase') {
      if (typeof node.params?.phases === 'string' && node.params.phases) {
        try {
          action.phases = JSON.parse(node.params.phases) as unknown
        } catch {
          action.phases = node.params.phases
        }
      }
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'play_music_intro') {
      if (typeof node.params?.intro === 'string' && node.params.intro) action.intro = node.params.intro
      if (typeof node.params?.loop === 'string' && node.params.loop) action.loop = node.params.loop
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    if (node.type === 'play_music_intro_layered') {
      if (typeof node.params?.intro === 'string' && node.params.intro) action.intro = node.params.intro
      if (typeof node.params?.calm === 'string' && node.params.calm) action.calm = node.params.calm
      if (typeof node.params?.battle === 'string' && node.params.battle) action.battle = node.params.battle
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      if (typeof node.params?.start_intensity === 'number') action.start_intensity = node.params.start_intensity
      return action
    }

    if (node.type === 'crossfade_music') {
      if (typeof node.params?.intensity === 'number') action.intensity = node.params.intensity
      if (typeof node.params?.fade === 'number') action.fade = node.params.fade
      return action
    }

    // Dialogue integration nodes.
    if (node.type === 'set_dialogue_speed') {
      if (typeof node.params?.speed === 'number') action.speed = node.params.speed
      return action
    }

    if (node.type === 'wait_typing') {
      return action
    }

    if (node.type === 'dialogue_control') {
      if (typeof node.params?.prevent_skip === 'boolean') action.prevent_skip = node.params.prevent_skip
      if (typeof node.params?.stay_open === 'boolean') action.stay_open = node.params.stay_open
      if (typeof node.params?.auto_advance === 'boolean') action.auto_advance = node.params.auto_advance
      return action
    }

    if (node.type === 'set_portrait_next') {
      if (typeof node.params?.target === 'string' && node.params.target) action.target = node.params.target
      if (typeof node.params?.emotion === 'string' && node.params.emotion) action.emotion = node.params.emotion
      return action
    }

    if (node.type === 'set_portrait_now') {
      if (typeof node.params?.target === 'string' && node.params.target) action.target = node.params.target
      if (typeof node.params?.emotion === 'string' && node.params.emotion) action.emotion = node.params.emotion
      return action
    }

    if (node.type === 'clear_dialogue') {
      return action
    }

    if (node.type === 'move_relative') {
      if (typeof node.params?.target === 'string' && node.params.target) action.target = node.params.target
      if (typeof node.params?.dx === 'number') action.dx = node.params.dx
      if (typeof node.params?.dy === 'number') action.dy = node.params.dy
      if (typeof node.params?.speed_px_sec === 'number') action.speed_px_sec = node.params.speed_px_sec
      if (typeof node.params?.collision === 'boolean') action.collision = node.params.collision
      return action
    }

    if (node.type === 'set_position_relative') {
      if (typeof node.params?.target === 'string' && node.params.target) action.target = node.params.target
      if (typeof node.params?.dx === 'number') action.dx = node.params.dx
      if (typeof node.params?.dy === 'number') action.dy = node.params.dy
      return action
    }

    // camera_shake / shake_object: backward compatibility for magnitude vs magnitude_x/y.
    if (node.type === 'camera_shake' || node.type === 'shake_object') {
      const p = node.params
      if (p) {
        if (typeof p.seconds === 'number') action.seconds = p.seconds
        const hasMx = typeof p.magnitude_x === 'number'
        const hasMy = typeof p.magnitude_y === 'number'
        if (hasMx || hasMy) {
          if (hasMx) action.magnitude_x = p.magnitude_x
          if (hasMy) action.magnitude_y = p.magnitude_y
        } else if (typeof p.magnitude === 'number') {
          action.magnitude = p.magnitude
        }
        if (typeof p.decay === 'boolean') action.decay = p.decay
        if (typeof p.frequency === 'number') action.frequency = p.frequency
      }
      return action
    }

// Копируем все параметры ноды (кроме editor-only полей).
    if (node.params) {
      for (const [key, value] of Object.entries(node.params)) {
        // Пропускаем editor-only поля (branches, joinId, pairId).
        if (['branches', 'joinId', 'pairId'].includes(key)) continue
        // Для tween пропускаем все поля, которые уже конвертированы выше
        if (node.type === 'tween' && ['kind', 'target', 'prop', 'property', 'end_value', 'to', 'start_value_override', 'from', 'duration_frames', 'seconds', 'ease_name', 'easing'].includes(key)) continue
        // Эти поля мы уже обработали выше.
        if (node.type === 'run_function' && ['function_name', 'function', 'args'].includes(key))
          continue
        if ((node.type === 'camera_shake' || node.type === 'shake_object') && ['seconds', 'magnitude', 'magnitude_x', 'magnitude_y', 'decay', 'frequency'].includes(key))
          continue
        if (value !== undefined && value !== null && value !== '') {
          action[key] = value
        }
      }
    }

    return action
  }

  // Запускаем обход от start-ноды.
  return walkFrom(startNode.id)
}

// Strip-export: формируем чистый JSON для движка.
export function stripExport(state: RuntimeState, actions: CompiledAction[]): ExportedCutscene {
  return {
    schema_version: 1,
    cutscene_id: state.title.replace(/\s+/g, '_').toLowerCase() || 'untitled',
    settings: {
      fps: 30
    },
    actions
  }
}
