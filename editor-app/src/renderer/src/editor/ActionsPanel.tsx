import React, { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { NODE_REGISTRY } from './nodes/nodeRegistry'

// Собственный MIME-type для drag-and-drop из палитры нод.
// NODE_REGISTRY импортируется напрямую — группируем по category здесь.
const NODE_PALETTE_DRAG_MIME = 'application/x-undefscene-node-type'

// Порядок отображения категорий в палитре.
const CATEGORY_ORDER = ['flow', 'movement', 'actor', 'visual', 'camera', 'dialogue', 'logic', 'audio', 'wait']

type ActionsPanelProps = {
  t: (key: string, fallback: string) => string
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onAddNode: (type: string) => void
}

export const ActionsPanel = React.memo(function ActionsPanel({
  t,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddNode
}: ActionsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})

  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }, [])

  // Группируем все ноды по категориям — мемоизируем, т.к. NODE_REGISTRY статичен.
  const grouped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    const map: Record<string, { type: string; label: string }[]> = {}
    for (const [type, def] of Object.entries(NODE_REGISTRY)) {
      const label = def.label ?? type
      // Фильтрация по поисковому запросу.
      if (query && !type.includes(query) && !label.toLowerCase().includes(query)) continue

      const cat = def.category ?? 'flow'
      if (!map[cat]) map[cat] = []
      map[cat].push({ type, label })
    }

    // Сортируем категории по заданному порядку, затем остальные алфавитно.
    const sortedKeys = [
      ...CATEGORY_ORDER.filter((c) => map[c]),
      ...Object.keys(map).filter((c) => !CATEGORY_ORDER.includes(c)).sort()
    ]

    return sortedKeys.map((cat) => ({
      cat,
      nodes: map[cat]
    }))
  }, [searchQuery])

  const handleDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData(NODE_PALETTE_DRAG_MIME, type)
    event.dataTransfer.setData('text/plain', type)
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handlePaletteClick = useCallback(
    (type: string) => () => {
      onAddNode(type)
    },
    [onAddNode]
  )

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  return (
    <div className="runtimeSection runtimeSectionActions">
      <div className="runtimeSectionTitle">{t('editor.actions', 'Actions')}</div>
      <div className="runtimeRow">
        <button className="runtimeButton" type="button" onClick={onSave}>
          {t('menu.save', 'Save')}
        </button>
        <button className="runtimeButton" type="button" onClick={onUndo} disabled={!canUndo}>
          {t('menu.undo', 'Undo')}
        </button>
        <button className="runtimeButton" type="button" onClick={onRedo} disabled={!canRedo}>
          {t('menu.redo', 'Redo')}
        </button>
      </div>

      {/* Палитра нод с поиском */}
      <div className="runtimeSectionTitle" style={{ marginTop: 2 }}>
        {t('editor.nodePalette', 'Node Palette')}
      </div>

      {/* Поиск */}
      <input
        className="paletteSearch"
        type="search"
        placeholder={t('editor.paletteSearch', 'Search nodes…')}
        value={searchQuery}
        onChange={handleSearchChange}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Сгруппированный список нод */}
      <div className="paletteList">
        {grouped.length === 0 && (
          <div className="paletteEmpty">{t('editor.paletteEmpty', 'No nodes found')}</div>
        )}
        {grouped.map(({ cat, nodes }) => {
          const isCollapsed = collapsedCategories[cat] === true

          return (
            <div key={cat} className={`paletteCategoryGroup ${isCollapsed ? 'is-collapsed' : ''}`}>
              {/* Заголовок категории */}
              <div
                className={`paletteCategoryHeader palette-cat-${cat}`}
                onClick={() => toggleCategory(cat)}
                style={{ cursor: 'pointer' }}
              >
                <span className="paletteCategoryIcon">
                  {isCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
                </span>
                <span className="paletteCategoryDot" />
                <span className="paletteCategoryLabel">
                  {t('editor.categories.' + cat, cat)}
                </span>
              </div>
              {/* Список нод в категории */}
              {!isCollapsed && nodes.map(({ type, label }) => (
                <button
                  key={type}
                  className={`paletteNodeItem palette-cat-${cat}`}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, type)}
                  onClick={handlePaletteClick(type)}
                >
                  <span className="paletteNodeDot" />
                  <span className="paletteNodeLabel">{label}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>

      <div className="runtimeHint">{t('editor.actionsHint', 'New nodes appear to the right of the selected node.')}</div>
    </div>
  )
})
