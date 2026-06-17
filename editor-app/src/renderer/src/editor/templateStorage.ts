import type { RuntimeNode, RuntimeEdge } from './runtimeTypes'

/**
 * Один сохранённый шаблон — это фрагмент катсцены (ноды и рёбра),
 * который пользователь может в любой момент вставить на холст.
 */
export type CutsceneTemplateSnippet = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  nodes: RuntimeNode[]
  edges: RuntimeEdge[]
}

/**
 * Формат хранилища в localStorage. Поле version нужно,
 * чтобы в будущем можно было сделать миграцию данных.
 */
export type TemplateStorage = {
  version: 1
  templates: CutsceneTemplateSnippet[]
}

const STORAGE_KEY = 'undefscene.cutsceneTemplates.v1'

// Генератор ID: используем Web Crypto API, если оно доступно, иначе — запасной вариант.
const generateId = (): string => {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string }
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return `tpl_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

// Глубокое клонирование через JSON, чтобы не менять исходные объекты.
const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/**
 * Загружаем список шаблонов из localStorage.
 * Если данных нет или формат не тот — возвращаем null.
 */
export function loadTemplates(): TemplateStorage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<TemplateStorage>
    if (candidate.version !== 1) {
      console.warn(
        `[templateStorage] Version mismatch: expected 1, got ${candidate.version}. Clearing templates.`
      )
      return null
    }
    if (!Array.isArray(candidate.templates)) return null
    return candidate as TemplateStorage
  } catch {
    return null
  }
}

/**
 * Сохраняем весь массив шаблонов в localStorage.
 */
export function saveTemplates(storage: TemplateStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch {
    // Если localStorage недоступен или переполнен — игнорируем ошибку.
  }
}

/**
 * Создаём новый шаблон из выделенных нод и рёбер.
 * Все объекты глубоко клонируются, чтобы изменения в катсцене
 * не затронули уже сохранённый шаблон.
 */
export function createTemplate(
  name: string,
  nodes: RuntimeNode[],
  edges: RuntimeEdge[]
): CutsceneTemplateSnippet {
  const now = Date.now()
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    nodes: deepClone(nodes),
    edges: deepClone(edges)
  }
}

/**
 * Подготавливаем шаблон к вставке на холст.
 * Меняем ID всех нод (чтобы не было конфликтов с существующими),
 * сдвигаем координаты и пересобираем рёбра с новыми ID.
 */
export function prepareTemplateForInsertion(
  template: CutsceneTemplateSnippet,
  offsetX: number,
  offsetY: number
): { nodes: RuntimeNode[]; edges: RuntimeEdge[] } {
  // Набор старых ID нод шаблона — нужен, чтобы отфильтровать "висячие" рёбра.
  const nodeIdSet = new Set(template.nodes.map((n) => n.id))

  // Карта: старый ID ноды → новый ID.
  const idMap = new Map<string, string>()
  for (const node of template.nodes) {
    idMap.set(node.id, generateId())
  }

  // Пересоздаём ноды: новый ID + сдвиг позиции.
  const nodes: RuntimeNode[] = template.nodes.map((node) => {
    const newId = idMap.get(node.id)
    if (!newId) {
      // Теоретически недостижимая ветка, но TypeScript хочет гарантий.
      throw new Error(`Missing ID mapping for node ${node.id}`)
    }
    const clone = deepClone(node)
    clone.id = newId
    if (clone.position) {
      clone.position = {
        x: clone.position.x + offsetX,
        y: clone.position.y + offsetY
      }
    }
    return clone
  })

  // Пересобираем рёбра: оставляем только те, что ведут внутри шаблона,
  // и подменяем source/target на свежие ID.
  const edges: RuntimeEdge[] = []
  for (const edge of template.edges) {
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) {
      continue
    }
    const newSource = idMap.get(edge.source)
    const newTarget = idMap.get(edge.target)
    if (!newSource || !newTarget) {
      continue
    }
    const clone = deepClone(edge)
    clone.id = generateId()
    clone.source = newSource
    clone.target = newTarget
    edges.push(clone)
  }

  return { nodes, edges }
}
