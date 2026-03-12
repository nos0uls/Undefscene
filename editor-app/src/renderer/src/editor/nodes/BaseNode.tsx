import { Handle, Position } from '@xyflow/react'
import type { ReactNode } from 'react'
import { NODE_CATEGORY, NODE_COLORS, NODE_LABELS } from './nodeConstants'

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

  // Выбрана ли нода.
  selected?: boolean

  // Дочерние элементы (параметры ноды).
  children?: ReactNode
}

// Базовый компонент ноды — общий каркас для всех типов.
// Рисует цветной заголовок, порты и тело с параметрами.
export function BaseNode({
  nodeType,
  label,
  hasInput = true,
  hasOutput = true,
  extraHandles,
  selected,
  children
}: BaseNodeProps): React.JSX.Element {
  const category = NODE_CATEGORY[nodeType] ?? 'flow'
  const color = NODE_COLORS[category] ?? '#888'
  const title = NODE_LABELS[nodeType] ?? nodeType

  return (
    <div
      className={['customNode', selected ? 'isSelected' : ''].filter(Boolean).join(' ')}
      style={{
        minWidth: 140,
        // Branch нода выше, чтобы TRUE/FALSE handles были хорошо разнесены.
        minHeight: nodeType === 'branch' ? 90 : undefined
      }}
    >
      {/* Цветная полоска сверху */}
      <div
        style={{
          height: 4,
          background: color,
          width: '100%'
        }}
      />
      {/* Заголовок ноды */}
      <div className="customNodeHeader">
        <span className="customNodeTitle" style={{ color: color }}>
          {title}
        </span>
        {label ? <span className="customNodeLabel">{label}</span> : null}
      </div>

      {/* Тело (детали) */}
      <div className="customNodeBody">{children}</div>

      {/* Входной порт (слева) */}
      {hasInput && <Handle type="target" position={Position.Left} className="customHandle" />}

      {/* Выходной порт (справа) */}
      {hasOutput && <Handle type="source" position={Position.Right} className="customHandle" />}

      {/* Дополнительные порты (для branch и т.д.) */}
      {extraHandles}
    </div>
  )
}
