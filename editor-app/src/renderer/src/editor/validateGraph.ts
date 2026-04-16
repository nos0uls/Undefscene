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
  camera_pan: ['x', 'y'],
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
  set_property: ['property'],
  emote: ['target'],
  jump: ['target'],
  halt: ['target'],
  flip: ['target'],
  spin: ['target'],
  shake_object: ['target'],
  set_visible: ['target']
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
        message: `Node "${n.id}" (${n.type}) has empty name.`
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
      // Дубликаты имён — совет, не ошибка.
      entries.push({
        severity: 'tip',
        nodeId: id,
        message: `Node name "${name}" is used by ${ids.length} nodes (${ids.join(', ')}).`
      })
    }
  }

  // --- 1. Проверяем наличие start и end нод ---
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')

  if (startNodes.length === 0) {
    entries.push({ severity: 'error', message: 'Graph has no "start" node.' })
  }
  if (startNodes.length > 1) {
    entries.push({
      severity: 'error',
      message: `Graph has ${startNodes.length} "start" nodes — only 1 is allowed.`
    })
  }
  if (endNodes.length === 0) {
    entries.push({ severity: 'error', message: 'Graph has no "end" node.' })
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
        message: `"start" node "${node.id}" has ${incoming.length} incoming edge(s) — start should have none.`
      })
    }

    // start должен иметь хотя бы один выход.
    if (node.type === 'start' && outgoing.length === 0) {
      entries.push({
        severity: 'error',
        nodeId: node.id,
        message: `"start" node "${node.id}" has no outgoing edges — graph cannot proceed.`
      })
    }

    // end не должен иметь исходящих рёбер.
    if (node.type === 'end' && outgoing.length > 0) {
      entries.push({
        severity: 'warn',
        nodeId: node.id,
        message: `"end" node "${node.id}" has ${outgoing.length} outgoing edge(s) — end should have none.`
      })
    }

    // Висящая нода: нет ни входящих, ни исходящих (кроме start/end).
    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'parallel_join') {
      if (incoming.length === 0 && outgoing.length === 0) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (${node.type}) is disconnected — no edges at all.`
        })
      } else if (incoming.length === 0 && node.type !== 'parallel_start') {
        // Нода без входящих — до неё нельзя добраться от start.
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (${node.type}) has no incoming edges — unreachable from start.`
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
        message: `Node "${node.id}" (${node.type}) has ${outgoing.length} outgoing edges — only 1 expected.`
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
            message: `Node "${node.id}" (${node.type}): required field "${field}" is empty.`
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
          message: `Node "${node.id}" (actor_create): neither "sprite_or_object" nor "copy_from" is set — engine will use default object.`
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
          message: `Branch "${node.id}" has no "false" output — if condition is false, nothing will happen.`
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
          message: `Node "${node.id}" (tween): target is required unless kind is "camera".`
        })
      }
      if (!property) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (tween): property is empty.`
        })
      }
      if (toValue === undefined || toValue === null || toValue === '') {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (tween): target value "to" is empty.`
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
          message: `Node "${node.id}" (set_property): target is required unless kind is "camera".`
        })
      }
      if (!property) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (set_property): property is empty.`
        })
      }
      if (value === undefined || value === null || value === '') {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (set_property): value is empty.`
        })
      }
    }

    if (node.type === 'play_sfx') {
      const sound = String(node.params?.sound ?? node.params?.key ?? '').trim()
      if (!sound) {
        entries.push({
          severity: 'warn',
          nodeId: node.id,
          message: `Node "${node.id}" (play_sfx): sound/key is empty.`
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
          message: `Node "${node.id}" (run_function): required field "function" is empty.`
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
            message: `Node "${node.id}" (run_function): args is not valid JSON.`
          })
        }
      }
    }

    // --- 5. Проверяем parallel_start ↔ parallel_join пару ---
    if (node.type === 'parallel_start') {
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      const branches = Array.isArray(node.params?.branches)
        ? (node.params?.branches as string[])
        : ['b0']
      if (!joinId) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_start "${node.id}" has no joinId — missing parallel_join pair.`
        })
      } else if (!nodeMap.has(joinId)) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_start "${node.id}" references joinId "${joinId}" which does not exist.`
        })
      } else {
        const joinNode = nodeMap.get(joinId)
        if (joinNode?.type !== 'parallel_join') {
          entries.push({
            severity: 'error',
            nodeId: node.id,
            message: `parallel_start "${node.id}" references "${joinId}", but that node is not parallel_join.`
          })
        }

        const joinPairId = typeof joinNode?.params?.pairId === 'string' ? joinNode.params.pairId : ''
        if (joinPairId && joinPairId !== node.id) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_start "${node.id}" points to join "${joinId}", but join points back to "${joinPairId}".`
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
            message: `parallel_start "${node.id}" and join "${joinId}" have different params.branches.`
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
          message: `parallel_start "${node.id}" has duplicate branch ids in params.branches.`
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
            message: `parallel_start "${node.id}" has edge "${edge.id}" without sourceHandle.`
          })
          continue
        }

        if (!handle.startsWith('out_')) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_start "${node.id}" has edge "${edge.id}" with unexpected sourceHandle "${handle}".`
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
            message: `parallel_start "${node.id}" has edge "${edge.id}" for branch "${branchId}" not listed in params.branches.`
          })
        }
      }

      for (const [handle, count] of outgoingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_start "${node.id}" uses handle "${handle}" ${count} times.`
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = outgoingEdges.some((edge) => edge.sourceHandle === `out_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_start "${node.id}" has branch "${branchId}" without outgoing edge.`
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
          message: `parallel_join "${node.id}" has no pairId — orphaned join node.`
        })
      } else if (!nodeMap.has(pairId)) {
        entries.push({
          severity: 'error',
          nodeId: node.id,
          message: `parallel_join "${node.id}" references pairId "${pairId}" which does not exist.`
        })
      } else {
        const startNode = nodeMap.get(pairId)
        if (startNode?.type !== 'parallel_start') {
          entries.push({
            severity: 'error',
            nodeId: node.id,
            message: `parallel_join "${node.id}" references "${pairId}", but that node is not parallel_start.`
          })
        }

        const startJoinId = typeof startNode?.params?.joinId === 'string' ? startNode.params.joinId : ''
        if (startJoinId && startJoinId !== node.id) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_join "${node.id}" points to start "${pairId}", but start points to "${startJoinId}".`
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
            message: `parallel_join "${node.id}" and start "${pairId}" have different params.branches.`
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
            message: `parallel_join "${node.id}" has edge "${edge.id}" without targetHandle.`
          })
          continue
        }

        if (!handle.startsWith('in_')) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            edgeId: edge.id,
            message: `parallel_join "${node.id}" has edge "${edge.id}" with unexpected targetHandle "${handle}".`
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
            message: `parallel_join "${node.id}" has edge "${edge.id}" for branch "${branchId}" not listed in params.branches.`
          })
        }
      }

      for (const [handle, count] of incomingHandleUsage.entries()) {
        if (count > 1) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_join "${node.id}" uses handle "${handle}" ${count} times.`
          })
        }
      }

      for (const branchId of uniqueBranches) {
        const hasEdge = incomingEdges.some((edge) => edge.targetHandle === `in_${branchId}`)
        if (!hasEdge) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `parallel_join "${node.id}" has branch "${branchId}" without incoming edge.`
          })
        }
      }
    }
  }

  // --- 6. Проверяем рёбра: source и target должны существовать ---
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      entries.push({
        severity: 'error',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references source "${edge.source}" which does not exist.`
      })
    }
    if (!nodeMap.has(edge.target)) {
      entries.push({
        severity: 'error',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references target "${edge.target}" which does not exist.`
      })
    }

    // Отрицательный wait — ошибка.
    if (typeof edge.waitSeconds === 'number' && edge.waitSeconds < 0) {
      entries.push({
        severity: 'warn',
        edgeId: edge.id,
        message: `Edge "${edge.id}" has negative waitSeconds (${edge.waitSeconds}).`
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
          message: `Edge "${edge.id}": Condition is enabled, but Variable is empty.`
        })
      } else if (varName.startsWith('global.')) {
        entries.push({
          severity: 'warn',
          edgeId: edge.id,
          message: `Edge "${edge.id}": Variable should be without "global." prefix (write just the key).`
        })
      }

      if (eq.trim().length === 0) {
        entries.push({
          severity: 'warn',
          edgeId: edge.id,
          message: `Edge "${edge.id}": Condition is enabled, but Equals is empty.`
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
              message: `Edge "${edge.id}": Stop-waiting "global_var" is set, but End Variable is empty.`
            })
          } else if (endVar.startsWith('global.')) {
            entries.push({
              severity: 'warn',
              edgeId: edge.id,
              message: `Edge "${edge.id}": End Variable should be without "global." prefix.`
            })
          }
          if (String(edge.endConditionEquals ?? '').trim().length === 0) {
            entries.push({
              severity: 'warn',
              edgeId: edge.id,
              message: `Edge "${edge.id}": Stop-waiting "global_var" is set, but End Equals is empty.`
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
              message: `Edge "${edge.id}": Stop-waiting "node_reached" is set, but Node name is empty.`
            })
          } else {
            // Проверяем, что нода с таким именем существует.
            const found = nodes.some((n) => String(n.name ?? '').trim() === nodeName)
            if (!found) {
              entries.push({
                severity: 'warn',
                edgeId: edge.id,
                message: `Edge "${edge.id}": Stop-waiting node "${nodeName}" not found in graph.`
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
              message: `Edge "${edge.id}": Stop-waiting "timeout" is set, but Timeout is empty or zero.`
            })
          }
        }
      }
    }
  }

  // --- 7. Проверяем достижимость от start (BFS) ---
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
        message: `${unreachableNodes.length} node(s) unreachable from start: ${unreachableNodes.map((n) => `"${n.id}"`).join(', ')}.`
      })
    }

    // Проверяем, что хотя бы одна end-нода достижима.
    const reachableEnd = endNodes.some((n) => reachable.has(n.id))
    if (!reachableEnd && endNodes.length > 0) {
      entries.push({
        severity: 'error',
        message: 'No "end" node is reachable from "start" — graph has no valid path to completion.'
      })
    }
  }

  // --- 8. Расширенная валидация с контекстом ресурсов ---
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
            message: `actor_create: key "${key}" not found in project resources.`
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
              message: `dialogue: file "${file}" not found in project yarn files.`
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
                  message: `dialogue: node "${nodeName}" not found in "${file}".`
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
            message: `run_function: "${funcName}" not in whitelist (cutscene_engine_settings.json).`
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
            message: `branch: condition "${cond}" not in whitelist (cutscene_engine_settings.json).`
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
            message: `animate: sprite "${sprite}" not found in project resources.`
          })
        }
      }

      if (node.type === 'emote' && context.sprites) {
        const sprite = String(params.sprite ?? '').trim()
        if (sprite && context.sprites.length > 0 && !context.sprites.includes(sprite)) {
          entries.push({
            severity: 'warn',
            nodeId: node.id,
            message: `emote: sprite "${sprite}" not found in project resources.`
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
