// compileGraph.ts — Компилятор графа нод → плоский actions[] для движка.
// Обходит граф от start-ноды до end, формируя массив действий.
// Поддерживает: parallel (вложенные ветки), branch (true/false), wait (с рёбер).

import type { RuntimeEdge, RuntimeNode, RuntimeState } from './runtimeTypes'

// Тип одного действия в экспортированном JSON.
export type CompiledAction = {
  type: string
  [key: string]: unknown
}

// Результат компиляции: либо успех с actions[], либо ошибка.
export type CompileResult =
  | { ok: true; actions: CompiledAction[] }
  | { ok: false; error: string }

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
export function compileGraph(state: RuntimeState): CompileResult {
  const { nodes, edges } = state

  // Ищем стартовую ноду.
  const startNode = nodes.find((n) => n.type === 'start')
  if (!startNode) {
    return { ok: false, error: 'No "start" node found in the graph.' }
  }

  // Проверяем, что есть хотя бы одна end-нода.
  const hasEnd = nodes.some((n) => n.type === 'end')
  if (!hasEnd) {
    return { ok: false, error: 'No "end" node found in the graph.' }
  }

  // Карта нод по ID для быстрого доступа.
  const nodeMap = new Map<string, RuntimeNode>()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
  }

  // Карта исходящих рёбер: nodeId → список рёбер.
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    const list = outEdges.get(e.source) ?? []
    list.push(e)
    outEdges.set(e.source, list)
  }

  // Множество посещённых нод — защита от бесконечных циклов.
  const visited = new Set<string>()

  // Рекурсивный обход: собираем actions начиная с nodeId.
  function walkFrom(nodeId: string): CompileResult {
    // Защита от циклов.
    if (visited.has(nodeId)) {
      return { ok: false, error: `Cycle detected at node "${nodeId}". Cycles are not allowed.` }
    }
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) {
      return { ok: false, error: `Node "${nodeId}" not found.` }
    }

    const actions: CompiledAction[] = []

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
    const regularOuts = outs.filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    if (regularOuts.length === 0) {
      return { ok: true, actions: [] }
    }

    // Если одно исходящее ребро — линейный путь.
    if (regularOuts.length === 1) {
      const edge = regularOuts[0]
      const actions: CompiledAction[] = []

      // Если на ребре есть waitSeconds — добавляем wait-действие.
      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        actions.push({ type: 'wait', seconds: edge.waitSeconds })
      }

      const next = walkFrom(edge.target)
      if (!next.ok) return next
      actions.push(...next.actions)
      return { ok: true, actions }
    }

    // Несколько исходящих рёбер — ошибка (кроме parallel/branch, которые обрабатываются отдельно).
    return {
      ok: false,
      error: `Node "${nodeId}" has ${regularOuts.length} outgoing edges. Only parallel_start and branch can have multiple outputs.`
    }
  }

  // Компилируем parallel: собираем ветки между parallel_start и parallel_join.
  function compileParallel(startNode: RuntimeNode): CompileResult {
    const joinId = typeof startNode.params?.joinId === 'string' ? startNode.params.joinId : ''
    const branches = Array.isArray(startNode.params?.branches) ? (startNode.params.branches as string[]) : ['b0']

    // Собираем исходящие рёбра parallel_start (кроме __pair).
    const outs = (outEdges.get(startNode.id) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    const branchActions: CompiledAction[][] = []

    for (const branchId of branches) {
      // Ищем ребро с sourceHandle, совпадающим с branchId.
      const edge = outs.find((e) => e.sourceHandle === branchId)
      if (!edge) {
        // Пустая ветка — допустимо.
        branchActions.push([])
        continue
      }

      const actions: CompiledAction[] = []

      // wait на ребре.
      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        actions.push({ type: 'wait', seconds: edge.waitSeconds })
      }

      // Обходим ветку до parallel_join.
      const branchResult = walkBranchUntil(edge.target, joinId)
      if (!branchResult.ok) return branchResult
      actions.push(...branchResult.actions)

      branchActions.push(actions)
    }

    const parallelAction: CompiledAction = {
      type: 'parallel',
      branches: branchActions
    }

    return { ok: true, actions: [parallelAction] }
  }

  // Обходим ветку до указанного stopNodeId (parallel_join).
  function walkBranchUntil(nodeId: string, stopNodeId: string): CompileResult {
    if (nodeId === stopNodeId) {
      return { ok: true, actions: [] }
    }

    if (visited.has(nodeId)) {
      return { ok: false, error: `Cycle detected at node "${nodeId}" inside parallel branch.` }
    }
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) {
      return { ok: false, error: `Node "${nodeId}" not found in parallel branch.` }
    }

    const actions: CompiledAction[] = []

    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
      actions.push(nodeToAction(node))
    }

    // Идём дальше.
    const outs = (outEdges.get(nodeId) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    if (outs.length === 1) {
      const edge = outs[0]
      if (typeof edge.waitSeconds === 'number' && edge.waitSeconds > 0) {
        actions.push({ type: 'wait', seconds: edge.waitSeconds })
      }
      const next = walkBranchUntil(edge.target, stopNodeId)
      if (!next.ok) return next
      actions.push(...next.actions)
    }

    return { ok: true, actions }
  }

  // Компилируем branch: condition → true_actions / false_actions.
  function compileBranch(node: RuntimeNode): CompileResult {
    const condition = typeof node.params?.condition === 'string' ? node.params.condition : ''

    const outs = (outEdges.get(node.id) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    // Ищем рёбра по handle: out_true и out_false.
    const trueEdge = outs.find((e) => e.sourceHandle === 'out_true') ?? outs[0]
    const falseEdge = outs.find((e) => e.sourceHandle === 'out_false') ?? outs[1]

    let trueActions: CompiledAction[] = []
    let falseActions: CompiledAction[] = []

    if (trueEdge) {
      if (typeof trueEdge.waitSeconds === 'number' && trueEdge.waitSeconds > 0) {
        trueActions.push({ type: 'wait', seconds: trueEdge.waitSeconds })
      }
      const result = walkFrom(trueEdge.target)
      if (!result.ok) return result
      trueActions.push(...result.actions)
    }

    if (falseEdge) {
      if (typeof falseEdge.waitSeconds === 'number' && falseEdge.waitSeconds > 0) {
        falseActions.push({ type: 'wait', seconds: falseEdge.waitSeconds })
      }
      const result = walkFrom(falseEdge.target)
      if (!result.ok) return result
      falseActions.push(...result.actions)
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

    // Копируем все параметры ноды (кроме editor-only полей).
    if (node.params) {
      for (const [key, value] of Object.entries(node.params)) {
        // Пропускаем editor-only поля (branches, joinId, pairId).
        if (['branches', 'joinId', 'pairId'].includes(key)) continue
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
