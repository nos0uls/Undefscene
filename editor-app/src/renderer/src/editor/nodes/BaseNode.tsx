import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { NODE_CATEGORY, NODE_LABELS } from './nodeConstants'
import { usePreferencesContext } from '../PreferencesContext'

// Пропсы для базовой ноды: тип, метка, дочерние элементы, порты.
type BaseNodeProps = {
  // Тип ноды (для цвета и заголовка).
  nodeType: string

  // Текст/метка, которую показываем под заголовком.
  label?: string

  // Показывать ли входной порт (слева).
  hasInput?: boolean

  // Показывать ли выходной порт (справа).
  hasOutput?: boolean

  // Дополнительные порты (например, true/false для branch).
  extraHandles?: ReactNode

  // Доп. inline-стили.
  // Нужны, когда конкретная нода должна слегка менять размер без отдельного CSS-класса.
  style?: CSSProperties

  // Выбрана ли нода.
  selected?: boolean

  // Дочерние элементы (параметры ноды).
  children?: ReactNode
}

// Базовый компонент ноды — общий каркас для всех типов.
// Рисует цветной заголовок, порты и тело с параметрами.
export const BaseNode = memo(function BaseNode({
  nodeType,
  label,
  hasInput = true,
  hasOutput = true,
  extraHandles,
  style,
  selected,
  children
}: BaseNodeProps): React.JSX.Element {
  const category = NODE_CATEGORY[nodeType] ?? 'flow'
  const title = NODE_LABELS[nodeType] ?? nodeType
  // Цвет раньше проставлялся inline на каждой ноде (dot + title) — 2 style prop'а
  // × 500 нод = 1000 setValueForStyle вызовов на mount (~77ms по трейсу).
  // Теперь цвет категории задаётся через `data-category` и CSS-селекторы в main.css,
  // что сокращает DOM-мутации до 1 атрибута на ноду.

  // Читаем настройку: показывать ли имя ноды на холсте.
  const prefs = usePreferencesContext()
  const showLabel = prefs.showNodeNameOnCanvas && label

  // Классы собираем без filter/join — это дешевле массивной аллокации на mount 500 нод.
  let nodeClass = 'customNode'
  if (selected) nodeClass += ' isSelected'
  if (prefs.liquidGlassEnabled) nodeClass += ' isLiquidGlass'

  // Для branch ноды нужен минимальный height, иначе TRUE/FALSE handle'ы слипаются.
  // Для остальных нод style либо не задан, либо приходит извне (parallel start/join).
  // ВАЖНО: liquid-glass CSS-переменные раньше задавались inline на КАЖДОЙ ноде.
  // Теперь они глобальные (ставит FlowCanvas через document root), поэтому
  // здесь мы их НЕ вычисляем — экономим ~500 object allocations на mount.
  const needsMinHeight = nodeType === 'branch'
  const rootStyle: CSSProperties | undefined = needsMinHeight || style
    ? { minHeight: needsMinHeight ? 90 : undefined, ...style }
    : undefined

  return (
    <div className={nodeClass} style={rootStyle} data-category={category}>
      {/* Заголовок ноды: dot + title + опциональный label.
          Раньше был лишний .customNodeTitleWrapper div — убрали,
          теперь header сам flex-wrap'ит label на новую строку через CSS.
          Цвет dot/title приходит через CSS var `--node-color`, выставляемую
          правилом `.customNode[data-category="..."]` — inline-стилей больше нет. */}
      <div className="customNodeHeader">
        <span className="customNodeDot" />
        <span className="customNodeTitle">{title}</span>
        {showLabel ? <span className="customNodeLabel">{label}</span> : null}
      </div>

      {/* Тело (детали параметров). Рендерим только если параметры есть —
          start/end ноды теперь не создают пустой div. */}
      {children ? <div className="customNodeBody">{children}</div> : null}

      {/* Входной порт (слева) */}
      {hasInput && <Handle type="target" position={Position.Left} className="customHandle" />}

      {/* Выходной порт (справа) */}
      {hasOutput && <Handle type="source" position={Position.Right} className="customHandle" />}

      {/* Дополнительные порты (для branch и т.д.) */}
      {extraHandles}
    </div>
  )
})
