import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { NODE_CATEGORY, NODE_COLORS, NODE_LABELS } from './nodeConstants'
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
  const color = NODE_COLORS[category] ?? '#888'
  const title = NODE_LABELS[nodeType] ?? nodeType

  // Читаем настройку: показывать ли имя ноды на холсте.
  const prefs = usePreferencesContext()
  const showLabel = prefs.showNodeNameOnCanvas && label

  return (
    <div
      className={[
        'customNode',
        selected ? 'isSelected' : '',
        prefs.liquidGlassEnabled ? 'isLiquidGlass' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        minWidth: 140,
        // Branch нода выше, чтобы TRUE/FALSE handles были хорошо разнесены.
        minHeight: nodeType === 'branch' ? 90 : undefined,
        // Передаем интенсивность Liquid Glass через CSS variables для гибкой стилизации.
        '--liquid-glass-blur': prefs.liquidGlassEnabled ? `${prefs.liquidGlassBlur * 20}px` : '0px',
        '--liquid-glass-alpha': prefs.liquidGlassEnabled ? 0.4 + (1 - prefs.liquidGlassBlur) * 0.5 : 1,
        ...style
      } as CSSProperties}
    >
      {/* Заголовок ноды с градиентом и акцентной точкой (RTX Свет) */}
      <div 
        className="customNodeHeader"
        style={{
          background: `rgba(0, 0, 0, 0.15)` // Simplified for performance on large graphs
        }}
      >
        <div className="customNodeTitleWrapper">
          <span 
            className="customNodeDot"
            style={{
              backgroundColor: color,
              // box-shadow is disabled in CSS for performance
            }} 
          />
          <span className="customNodeTitle" style={{ color: color }}>
            {title}
          </span>
        </div>
        {showLabel ? <span className="customNodeLabel">{label}</span> : null}
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
})
