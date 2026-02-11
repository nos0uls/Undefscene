// validateGraph.ts — Валидация графа перед экспортом.
// Проверяет структуру графа: связность, обязательные поля, висящие ноды и т.д.
// Возвращает массив предупреждений/ошибок, которые показываются в панели Logs.

import type { RuntimeState, RuntimeNode, RuntimeEdge } from './runtimeTypes'

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
  follow_path: ['target']
}

// Главная функция валидации. Принимает текущее состояние графа.
export function validateGraph(state: RuntimeState): ValidationResult {
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
    entries.push({ severity: 'error', message: `Graph has ${startNodes.length} "start" nodes — only 1 is allowed.` })
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
      const branches = Array.isArray(node.params?.branches) ? (node.params?.branches as string[]) : ['b0']
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
      const branches = Array.isArray(node.params?.branches) ? (node.params?.branches as string[]) : ['b0']
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
      }

      // Проверяем, что входящие handle-ы совпадают с branches.
      const uniqueBranches = new Set(branches)
      const incomingEdges = (inEdges.get(node.id) ?? []).filter(
        (e) => e.sourceHandle !== '__pair' && e.targetHandle !== '__pair'
      )

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

  return {
    entries,
    hasErrors: entries.some((e) => e.severity === 'error')
  }
}
