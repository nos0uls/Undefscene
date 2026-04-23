// validateGraph.ts — Валидация графа перед экспортом.
// Проверяет структуру графа: связность, обязательные поля, висящие ноды и т.д.
// Возвращает массив предупреждений/ошибок, которые показываются в панели Logs.

import type { RuntimeState, RuntimeNode, RuntimeEdge } from './runtimeTypes'

// Контекст ресурсов проекта для расширенной валидации.
export type ValidationContext = {
  // Список объектов из .yyp (для проверки actor_create.key, target и т.д.).
  objects?: string[]
  // Список спрайтов из .yyp.
  sprites?: string[]
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
  severity: ValidationSeverity
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
  actor_create: ['key'],
  actor_destroy: ['target'],
  animate: ['target'],
  camera_track: ['target'],
  camera_track_until_stop: ['target'],
  camera_pan: ['x', 'y'],
  camera_pan_obj: ['target'],
  camera_center: [],
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
  tween: ['property'],
  tween_camera: ['property'],
  set_property: ['property'],
  emote: ['target'],
  jump: ['target'],
  halt: ['target'],
  flip: ['target'],
  spin: ['target'],
  shake_object: ['target'],
  set_visible: ['target'],
  mark_node: ['name']
}

// Главная функция валидации. Принимает текущее состояние графа и опциональный контекст ресурсов.
export function validateGraph(
  state: RuntimeState,
  context?: ValidationContext
): ValidationResult {
  const entries: ValidationEntry[] = []
  const { nodes, edges } = state

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
        nodeId: n.id,
        message: `Node ${n.id} (${n.type}) has no name. Double-click the node to set one.`
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
        nodeId: id,
        message: `Name "${name}" is used by ${ids.length} nodes. Rename to avoid confusion.`
      })
    }
  }

  // --- 1. Проверяем наличие start и end нод ---
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')

  if (startNodes.length === 0) {
    entries.push({ severity: 'error', message: 'Missing start node. Add a start node to define the entry point.' })
  }
  if (startNodes.length > 1) {
    entries.push({
      severity: 'error',
        message: `Only one start node allowed. Remove ${startNodes.length - 1} extra start node(s).`
    })
  }
  if (endNodes.length === 0) {
    entries.push({ severity: 'error', message: 'Missing end node. Add an end node to mark the cutscene completion.' })
  }

  // --- 2. Карты для быстрого доступа ---
  const nodeMap = new Map<string, RuntimeNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Входящие и исходящие рёбра для каждой ноды.
  const inEdges = new Map<string, RuntimeEdge[]>()
  const outEdges = new Map<string, RuntimeEdge[]>()
  for (const e of edges) {
    inEdges.set(e.target, [...(inEdges.get(e.target) ?? []), e])
    outEdges.set(e.source, [...(outEdges.get(e.source) ?? []), e])
  }

  // --- 3. Проверяем каждую ноду ---
  for (const node of nodes) {
    const incoming = (inEdges.get(node.id) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )
    const outgoing = (outEdges.get(node.id) ?? []).filter(
      (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
    )

    // start не должен иметь входящих рёбер.
    if (node.type === 'start' && incoming.length > 0) {
      entries.push({
        severity: 'warn',
        nodeId: node.id,
        message: `Start node has incoming connections. Remove them — start must be the entry point.`
      })
    }

    // start должен иметь хотя бы один выход.
    if (node.type === 'start' && outgoing.length === 0) {
      entries.push({
        severity: 'error',
        nodeId: node.id,
        message: `Start node has no outgoing connection. Link it to the first action.`
      })
    }

    // end не должен иметь исходящих рёбер.
    if (node.type === 'end' && outgoing.length > 0) {
      entries.push({
        severity: 'warn',
        nodeId: node.id,
        message: `End node has outgoing connections. Remove them — end must be the final step.`
      })
    }

    // Висящая нода: нет ни входящих, ни исходящих (кроме start/end).
    const nodeDisplayName = node.name && node.name.length > 0 ? `"${node.name}"` : `Нода (${node.type})`
    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
      if (incoming.length === 0 && outgoing.length === 0) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName} is isolated. Connect it or delete if unused.`
        })
      } else if (incoming.length === 0 && node.type !== 'parallel_start') {
        // Нода без входящих — до неё нельзя добраться от start.
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName} is unreachable from start. Check connections.`
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
        nodeId: node.id,
        message: `${nodeDisplayName} has multiple outputs. Only branch and parallel_start support this.`
      })
    }

    // --- 4. Проверяем обязательные параметры ---
    const requiredFields = REQUIRED_PARAMS[node.type]
    if (requiredFields) {
      for (const field of requiredFields) {
        const value = node.params?.[field]
        if (value === undefined || value === null || value === '') {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `${nodeDisplayName}: field "${field}" is empty. Open the inspector to fill it.`
          })
        }
      }
    }

    // actor_create: если нет ни sprite_or_object, ни copy_from — предупреждаем.
    // Движок подставит дефолтный obj_actor, но пользователь скорее всего забыл заполнить.
    if (node.type === 'actor_create') {
      const spr = node.params?.sprite_or_object
      const copyFrom = node.params?.copy_from
      const hasSpr = typeof spr === 'string' ? spr.trim().length > 0 : !!spr
      const hasCopy = typeof copyFrom === 'string' ? copyFrom.trim().length > 0 : !!copyFrom
      if (!hasSpr && !hasCopy) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: no sprite_or_object or copy_from set. A default actor will be used.`
        })
      }
    }

    // branch: если нет false-ветки — это tip (не ошибка, но может быть забыто).
    if (node.type === 'branch') {
      const outgoing = (outEdges.get(node.id) ?? []).filter(
        (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
      )
      const hasFalse = outgoing.some((e) => e.sourceHandle === 'out_false')
      if (!hasFalse) {
        entries.push({
          severity: 'tip',
          nodeId: node.id,
          message: `${nodeDisplayName}: false branch is empty. If the condition fails, execution stops. Connect the false output or change the condition.`
        })
      }
    }

    if (node.type === 'tween') {
      const kind = String(node.params?.kind ?? 'instance').trim()
      const target = String(node.params?.target ?? '').trim()
      const property = String(node.params?.property ?? node.params?.field ?? '').trim()
      const toValue = node.params?.to ?? node.params?.end_value ?? node.params?.value
      if (kind !== 'camera' && !target) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: target is required when kind is not camera.`
        })
      }
      if (!property) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: no tween property selected.`
        })
      }
      if (toValue === undefined || toValue === null || toValue === '') {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: end value (To) is missing.`
        })
      }
    }

    if (node.type === 'set_property') {
      const kind = String(node.params?.kind ?? 'instance').trim()
      const target = String(node.params?.target ?? '').trim()
      const property = String(node.params?.property ?? node.params?.field ?? '').trim()
      const value = node.params?.value
      if (kind !== 'camera' && !target) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: target is required when kind is not camera.`
        })
      }
      if (!property) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: no property selected.`
        })
      }
      if (value === undefined || value === null || value === '') {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: value is empty.`
        })
      }
    }

    if (node.type === 'play_sfx') {
      const sound = String(node.params?.sound ?? node.params?.key ?? '').trim()
      if (!sound) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: no sound selected.`
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
          nodeId: node.id,
          message: `${nodeDisplayName}: function name is empty.`
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
            nodeId: node.id,
            message: `${nodeDisplayName}: args JSON is invalid. Check syntax in the inspector.`
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
          nodeId: node.id,
          message: `${nodeDisplayName}: dialogue file is not set. Select a .yarn file in the inspector.`
        })
      }
    }

    if (node.type === 'camera_shake') {
      const duration = Number(node.params?.duration ?? 0)
      if (duration <= 0) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: duration is zero or negative. Set a positive duration.`
        })
      }
    }

    if (node.type === 'follow_path') {
      const path = Array.isArray(node.params?.path) ? node.params?.path : []
      if (path.length === 0) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: path is empty. Draw or import a path in the inspector.`
        })
      } else if (path.length < 2) {
        entries.push({
          severity: 'tip',
          nodeId: node.id,
          message: `${nodeDisplayName}: path has only 1 point. Consider using set_position instead.`
        })
      }
    }

    if (node.type === 'halt') {
      const hasOutgoing = (outEdges.get(node.id) ?? []).some(
        (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
      )
      if (hasOutgoing) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: halt blocks execution, yet it has outgoing connections. Remove them or use a different node.`
        })
      }
    }

    if (node.type === 'mark_node') {
      const markName = String(node.params?.name ?? '').trim()
      if (!markName) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: marker name is empty. Set a unique name so other nodes can reference it.`
        })
      }
    }

    if (node.type === 'set_facing') {
      const direction = String(node.params?.direction ?? '').trim().toLowerCase()
      if (direction && direction !== 'left' && direction !== 'right') {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: direction must be "left" or "right". Got "${direction}".`
        })
      }
    }

    if (node.type === 'jump') {
      const jumpTarget = String(node.params?.target ?? '').trim()
      if (!jumpTarget) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `${nodeDisplayName}: jump target is empty. Fill the Target field in the inspector.`
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
          nodeId: node.id,
          message: `parallel_start "${node.id}": missing parallel_join pair.`
        })
      } else if (!nodeMap.has(joinId)) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_start "${node.id}": joinId references a missing node.`
        })
      } else {
        const joinNode = nodeMap.get(joinId)
        if (joinNode?.type !== 'parallel_join') {
          entries.push({
            severity: 'error',
            nodeId: node.id,
            message: `parallel_start "${node.id}": paired node is not a parallel_join.`
          })
        }

        const joinPairId = typeof joinNode?.params?.pairId === 'string' ? joinNode.params.pairId : ''
        if (joinPairId && joinPairId !== node.id) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_start "${node.id}" and join "${joinId}" point to different partners. Fix the pair IDs.`
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
            nodeId: node.id,
            message: `parallel_start "${node.id}" and join "${joinId}" have different branch lists.`
          })
        }
      }

      // Проверяем, что handle-ы совпадают с branches.
      // Это нужно, чтобы ветки не "терялись" при компиляции.
      const uniqueBranches = new Set(branches)
      if (uniqueBranches.size !== branches.length) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `parallel_start "${node.id}" has duplicate branch IDs in params.branches.`
        })
      }

      const outgoingEdges = (outEdges.get(node.id) ?? []).filter(
        (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
      )
      const outgoingHandleUsage = new Map<string, number>()

      for (const edge of outgoingEdges) {
        const handle = edge.sourceHandle
        if (!handle) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_start "${node.id}" edge "${edge.id}" has no sourceHandle. Reconnect the branch.`
          })
          continue
        }

        if (!handle.startsWith('out_')) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_start "${node.id}" edge "${edge.id}" has unexpected sourceHandle "${handle}".`
          })
          continue
        }

        outgoingHandleUsage.set(handle, (outgoingHandleUsage.get(handle) ?? 0) + 1)

        const branchId = handle.slice('out_'.length)
        if (!uniqueBranches.has(branchId)) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_start "${node.id}" has edge for branch "${branchId}", but it is not listed in params.branches.`
          })
        }
      }

      for (const [handle, count] of outgoingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_start "${node.id}" branch "${handle}" is used by ${count} edges. Only one edge per branch.`
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = outgoingEdges.some((edge) => edge.sourceHandle === `out_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_start "${node.id}" branch "${branchId}" has no outgoing edge.`
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
          nodeId: node.id,
          message: `parallel_join "${node.id}" has no pair. Link it to a parallel_start.`
        })
      } else if (!nodeMap.has(pairId)) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_join "${node.id}" pairId references a missing node.`
        })
      } else {
        const startNode = nodeMap.get(pairId)
        if (startNode?.type !== 'parallel_start') {
          entries.push({
            severity: 'error',
            nodeId: node.id,
            message: `parallel_join "${node.id}" paired node is not a parallel_start.`
          })
        }

        const startJoinId = typeof startNode?.params?.joinId === 'string' ? startNode.params.joinId : ''
        if (startJoinId && startJoinId !== node.id) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_join "${node.id}" and start "${pairId}" point to different partners. Fix the pair IDs.`
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
            nodeId: node.id,
            message: `parallel_join "${node.id}" and start "${pairId}" have different branch lists.`
          })
        }
      }

      // Проверяем, что входящие handle-ы совпадают с branches.
      const uniqueBranches = new Set(branches)
      const incomingEdges = (inEdges.get(node.id) ?? []).filter(
        (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
      )
      const incomingHandleUsage = new Map<string, number>()

      for (const edge of incomingEdges) {
        const handle = edge.targetHandle
        if (!handle) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_join "${node.id}" edge "${edge.id}" has no targetHandle. Reconnect the branch.`
          })
          continue
        }

        if (!handle.startsWith('in_')) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_join "${node.id}" edge "${edge.id}" has unexpected targetHandle "${handle}".`
          })
          continue
        }

        incomingHandleUsage.set(handle, (incomingHandleUsage.get(handle) ?? 0) + 1)

        const branchId = handle.slice('in_'.length)
        if (!uniqueBranches.has(branchId)) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_join "${node.id}" edge "${edge.id}" references branch "${branchId}" not listed in params.branches.`
          })
        }
      }

      for (const [handle, count] of incomingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_join "${node.id}" branch "${handle}" is used by ${count} edges. Only one edge per branch.`
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = incomingEdges.some((edge) => edge.targetHandle === `in_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_join "${node.id}" branch "${branchId}" has no incoming edge.`
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
        edgeId: edge.id,
        message: `Edge "${edge.id}" references missing source node "${edge.source}".`
      })
    }
    if (!nodeMap.has(edge.target)) {
      entries.push({
        severity: 'error',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references missing target node "${edge.target}".`
      })
    }

    // Отрицательный wait — ошибка.
    if (typeof edge.waitSeconds === 'number' && edge.waitSeconds < 0) {
      entries.push({
        severity: 'warn',
        edgeId: edge.id,
        message: `Edge "${edge.id}" has negative waitSeconds (${edge.waitSeconds}). Use 0 or a positive number.`
      })
    }

    // Условие на ребре: если включено, то переменная должна быть задана.
    if (edge.conditionEnabled) {
      const varName = String(edge.conditionVar ?? '').trim()
      const eq = String(edge.conditionEquals ?? '')

      if (!varName) {
        entries.push({
          severity: 'warn',
          edgeId: edge.id,
          message: `Edge "${edge.id}": condition enabled but Variable is empty.`
        })
      } else if (varName.startsWith('global.')) {
        entries.push({
          severity: 'warn',
          edgeId: edge.id,
          message: `Edge "${edge.id}": remove "global." prefix from the variable name.`
        })
      }

      if (eq.trim().length === 0) {
        entries.push({
          severity: 'warn',
          edgeId: edge.id,
          message: `Edge "${edge.id}": condition enabled but Equals is empty.`
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
              edgeId: edge.id,
              message: `Edge "${edge.id}": stop-waiting "global_var" set but End Variable is empty.`
            })
          } else if (endVar.startsWith('global.')) {
            entries.push({
              severity: 'warn',
              edgeId: edge.id,
              message: `Edge "${edge.id}": remove "global." prefix from End Variable.`
            })
          }
          if (String(edge.endConditionEquals ?? '').trim().length === 0) {
            entries.push({
              severity: 'warn',
              edgeId: edge.id,
              message: `Edge "${edge.id}": stop-waiting "global_var" set but End Equals is empty.`
            })
          }
        }

        // End-condition: node_reached — нужно имя ноды.
        if (stopWhen === 'node_reached') {
          const nodeName = String(edge.endNodeName ?? '').trim()
          if (!nodeName) {
            entries.push({
              severity: 'warn',
              edgeId: edge.id,
              message: `Edge "${edge.id}": stop-waiting "node_reached" set but Node name is empty.`
            })
          } else {
            // Проверяем, что нода с таким именем существует.
            const found = nodes.some((n) => String(n.name ?? '').trim() === nodeName)
            if (!found) {
              entries.push({
                severity: 'warn',
                edgeId: edge.id,
                message: `Edge "${edge.id}": stop-waiting node "${nodeName}" does not exist in the graph.`
              })
            }
          }
        }

        // End-condition: timeout — нужно число > 0.
        if (stopWhen === 'timeout') {
          const t = edge.endTimeoutSeconds
          if (typeof t !== 'number' || t <= 0) {
            entries.push({
              severity: 'warn',
              edgeId: edge.id,
              message: `Edge "${edge.id}": stop-waiting "timeout" set but Timeout is empty or zero.`
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
        message: `${unreachableNodes.length} node(s) unreachable from start. Check connections or remove unused nodes.`
      })
    }

    // Проверяем, что хотя бы одна end-нода достижима.
    const reachableEnd = endNodes.some((n) => reachable.has(n.id))
    if (!reachableEnd && endNodes.length > 0) {
      entries.push({
        severity: 'error',
        message: 'No end node is reachable from start. Add or connect an end node.'
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
            nodeId: node.id,
            message: `actor_create: key "${key}" not found in project resources. Check the object/sprite name or reload the project.`
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
              nodeId: node.id,
              message: `dialogue: file "${file}" not found in project yarn files. Check the file name or Dialogues folder.`
            })
          } else {
            // Проверка dialogue.node — должен быть в списке нод внутри файла.
            const nodeName = String(params.node ?? '').trim()
            if (nodeName) {
              const yarnNodes = context.yarnFiles.get(file) ?? context.yarnFiles.get(file + '.yarn') ?? []
              if (yarnNodes.length > 0 && !yarnNodes.includes(nodeName)) {
                entries.push({
                  severity: 'warn',
                  nodeId: node.id,
                  message: `dialogue: node "${nodeName}" not found in "${file}". Check the node name in the Yarn editor.`
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
            nodeId: node.id,
            message: `run_function: "${funcName}" is not in the whitelist. Add it to cutscene_engine_settings.json or check the spelling.`
          })
        }
      }

      // Проверка branch.condition — должна быть в whitelist.
      if (node.type === 'branch' && context.branchConditions) {
        const cond = String(params.condition ?? '').trim()
        if (cond && context.branchConditions.length > 0 && !context.branchConditions.includes(cond)) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `branch: condition "${cond}" is not in the whitelist. Add it to cutscene_engine_settings.json or check the spelling.`
          })
        }
      }

      // Проверка animate.sprite — должен быть в списке спрайтов.
      if (node.type === 'animate' && context.sprites) {
        const sprite = String(params.sprite ?? '').trim()
        if (sprite && context.sprites.length > 0 && !context.sprites.includes(sprite)) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `animate: sprite "${sprite}" not found in project resources. Check the sprite name or reload the project.`
          })
        }
      }

      if (node.type === 'emote' && context.sprites) {
        const sprite = String(params.sprite ?? '').trim()
        if (sprite && context.sprites.length > 0 && !context.sprites.includes(sprite)) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `emote: sprite "${sprite}" not found in project resources. Check the sprite name or reload the project.`
          })
        }
      }
    }
  }

  return {
    entries,
    hasErrors: entries.some((e) => e.severity === 'error')
  }
}
