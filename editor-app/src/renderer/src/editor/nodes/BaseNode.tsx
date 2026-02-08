import { Handle, Position } from '@xyflow/react'
import type { ReactNode } from 'react'

// Цвета для разных категорий нод.
// Так пользователь сразу видит, к какой группе относится нода.
export const NODE_COLORS: Record<string, string> = {
  flow: '#5b8def',       // start, end, wait
  movement: '#e8a838',   // move, follow_path, set_position
  actor: '#6ecf72',      // actor_create, actor_destroy
  visual: '#c77dff',     // animate, set_facing, set_depth
  dialogue: '#ff6b8a',   // dialogue
  camera: '#4ecdc4',     // camera_track, camera_pan
  logic: '#ff9f43',      // parallel, branch, run_function
}

// Маппинг типа ноды → категория (для цвета).
export const NODE_CATEGORY: Record<string, string> = {
  start: 'flow',
  end: 'flow',
  wait: 'flow',
  move: 'movement',
  follow_path: 'movement',
  set_position: 'movement',
  actor_create: 'actor',
  actor_destroy: 'actor',
  animate: 'visual',
  set_facing: 'visual',
  set_depth: 'visual',
  dialogue: 'dialogue',
  camera_track: 'camera',
  camera_pan: 'camera',
  parallel: 'logic',
  branch: 'logic',
  run_function: 'logic',
}

// Короткие метки для типов нод (отображаются в заголовке).
export const NODE_LABELS: Record<string, string> = {
  start: 'Start',
  end: 'End',
  wait: 'Wait',
  move: 'Move',
  follow_path: 'Follow Path',
  set_position: 'Set Position',
  actor_create: 'Actor Create',
  actor_destroy: 'Actor Destroy',
  animate: 'Animate',
  set_facing: 'Set Facing',
  set_depth: 'Set Depth',
  dialogue: 'Dialogue',
  camera_track: 'Camera Track',
  camera_pan: 'Camera Pan',
  parallel: 'Parallel',
  branch: 'Branch',
  run_function: 'Run Function',
}

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
      className="customNode"
      style={{
        borderColor: selected ? '#fff' : color,
        minWidth: 140
      }}
    >
      {/* Заголовок ноды с цветной полоской */}
      <div className="customNodeHeader" style={{ background: color }}>
        <span className="customNodeTitle">{title}</span>
      </div>

      {/* Тело ноды: метка и параметры */}
      <div className="customNodeBody">
        {label && <div className="customNodeLabel">{label}</div>}
        {children}
      </div>

      {/* Входной порт (слева) */}
      {hasInput && (
        <Handle type="target" position={Position.Left} className="customHandle" />
      )}

      {/* Выходной порт (справа) */}
      {hasOutput && (
        <Handle type="source" position={Position.Right} className="customHandle" />
      )}

      {/* Дополнительные порты (для branch и т.д.) */}
      {extraHandles}
    </div>
  )
}
