import { Handle, Position } from '@xyflow/react'
import { BaseNode } from './BaseNode'

// Тип данных, которые React Flow передаёт в каждую ноду.
type CutsceneNodeData = {
  label?: string
  params?: Record<string, unknown>

  // Коллбек для кнопки "Add Branch" внутри parallel-ноды.
  // Это UI-only поле, мы НЕ пишем его в runtime.json.
  onAddParallelBranch?: (parallelStartId: string) => void
}

// Тип пропсов, которые React Flow передаёт в custom node component.
type CutsceneNodeProps = {
  data: CutsceneNodeData
  selected?: boolean
}

// --- Flow-ноды ---

// Стартовая нода: только выход, без входа.
export function StartNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="start" label={data.label} hasInput={false} hasOutput selected={selected} />
  )
}

// Конечная нода: только вход, без выхода.
export function EndNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="end" label={data.label} hasInput hasOutput={false} selected={selected} />
  )
}

// Пауза: ждём N секунд.
export function WaitNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="wait" selected={selected}>
      <div className="customNodeParam">{String(seconds)}s</div>
    </BaseNode>
  )
}

// --- Movement-ноды ---

// Перемещение актёра в точку.
export function MoveNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="move" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">→ {String(x)}, {String(y)}</div>
    </BaseNode>
  )
}

// Перемещение по набору точек.
export function FollowPathNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const points = Array.isArray(data.params?.points) ? data.params.points.length : 0
  return (
    <BaseNode nodeType="follow_path" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{points} points</div>
    </BaseNode>
  )
}

// Мгновенная установка позиции.
export function SetPositionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="set_position" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">@ {String(x)}, {String(y)}</div>
    </BaseNode>
  )
}

// --- Actor-ноды ---

// Создание актёра.
export function ActorCreateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const key = data.params?.key ?? ''
  const obj = data.params?.sprite_or_object ?? ''
  return (
    <BaseNode nodeType="actor_create" selected={selected}>
      <div className="customNodeParam">{String(key)}</div>
      {obj && <div className="customNodeParam">{String(obj)}</div>}
    </BaseNode>
  )
}

// Уничтожение актёра.
export function ActorDestroyNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="actor_destroy" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
}

// --- Visual-ноды ---

// Анимация спрайта.
export function AnimateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  return (
    <BaseNode nodeType="animate" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      {sprite && <div className="customNodeParam">{String(sprite)}</div>}
    </BaseNode>
  )
}

// Установка направления взгляда.
export function SetFacingNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const direction = data.params?.direction ?? '?'
  return (
    <BaseNode nodeType="set_facing" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">dir: {String(direction)}</div>
    </BaseNode>
  )
}

// Установка глубины.
export function SetDepthNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const depth = data.params?.depth ?? '?'
  return (
    <BaseNode nodeType="set_depth" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">depth: {String(depth)}</div>
    </BaseNode>
  )
}

// --- Dialogue ---

// Диалоговая нода.
export function DialogueNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const file = data.params?.file ?? ''
  const node = data.params?.node ?? ''
  return (
    <BaseNode nodeType="dialogue" selected={selected}>
      {file && <div className="customNodeParam">{String(file)}</div>}
      {node && <div className="customNodeParam">→ {String(node)}</div>}
      {data.label && !file && <div className="customNodeParam">{data.label}</div>}
    </BaseNode>
  )
}

// --- Camera ---

// Камера следит за целью.
export function CameraTrackNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="camera_track" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(seconds)}s</div>
    </BaseNode>
  )
}

// Камера панорамирует к точке.
export function CameraPanNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="camera_pan" selected={selected}>
      <div className="customNodeParam">→ {String(x)}, {String(y)}</div>
      <div className="customNodeParam">{String(seconds)}s</div>
    </BaseNode>
  )
}

// --- Logic ---

// Параллельное выполнение делаем как ПАРУ нод:
// - parallel_start (fork): один вход, N выходов
// - parallel_join (join): N входов, один выход
// Каждая нода имеет кнопку "Add Branch", чтобы добавить ещё одну пару портов.

// Вспомогательная функция: рисуем список handles по веткам.
function renderParallelHandles(kind: 'source' | 'target', branchIds: string[]) {
  const count = Math.max(1, branchIds.length)
  return branchIds.map((branchId, i) => {
    const topPct = ((i + 1) / (count + 1)) * 100
    const handleId = kind === 'source' ? `out_${branchId}` : `in_${branchId}`
    return (
      <Handle
        key={handleId}
        type={kind}
        id={handleId}
        position={kind === 'source' ? Position.Right : Position.Left}
        className="customHandle"
        style={{ top: `${topPct}%` }}
      />
    )
  })
}

// Fork-нода: много выходов.
export function ParallelStartNode(props: any): React.JSX.Element {
  const id = String(props?.id ?? '')
  const data = (props?.data ?? {}) as CutsceneNodeData
  const selected = Boolean(props?.selected)
  const branches = (Array.isArray(data.params?.branches) ? data.params?.branches : ['b0']) as string[]

  return (
    <BaseNode
      nodeType="parallel"
      selected={selected}
      hasOutput={false}
      extraHandles={
        <>
          {/* Скрытый handle для внутренней связи пары start→join */}
          <Handle
            type="source"
            id="__pair"
            position={Position.Right}
            className="customHandle"
            style={{ top: '50%', opacity: 0, pointerEvents: 'none' }}
          />
          {renderParallelHandles('source', branches)}
        </>
      }
    >
      <button
        className="customNodeButton"
        type="button"
        onClick={() => data.onAddParallelBranch?.(id)}
      >
        Add Branch
      </button>
    </BaseNode>
  )
}

// Join-нода: много входов.
export function ParallelJoinNode(props: any): React.JSX.Element {
  const id = String(props?.id ?? '')
  const data = (props?.data ?? {}) as CutsceneNodeData
  const selected = Boolean(props?.selected)
  const branches = (Array.isArray(data.params?.branches) ? data.params?.branches : ['b0']) as string[]
  const pairId = typeof data.params?.pairId === 'string' ? (data.params?.pairId as string) : ''

  return (
    <BaseNode
      nodeType="parallel"
      selected={selected}
      hasInput={false}
      extraHandles={
        <>
          {/* Скрытый handle для внутренней связи пары start→join */}
          <Handle
            type="target"
            id="__pair"
            position={Position.Left}
            className="customHandle"
            style={{ top: '50%', opacity: 0, pointerEvents: 'none' }}
          />
          {renderParallelHandles('target', branches)}
        </>
      }
    >
      <button
        className="customNodeButton"
        type="button"
        // Для join мы добавляем ветку через start-id (pairId).
        onClick={() => data.onAddParallelBranch?.(pairId || id)}
      >
        Add Branch
      </button>
    </BaseNode>
  )
}

// Ветвление по условию: вход, выход true (вверху справа), выход false (внизу справа).
// Увеличена высота и разнесены handles для удобства.
export function BranchNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const condition = data.params?.condition ?? ''
  return (
    <BaseNode
      nodeType="branch"
      selected={selected}
      hasOutput={false}
      extraHandles={
        <>
          {/* Выход "true" — верхняя правая точка */}
          <Handle
            type="source"
            position={Position.Right}
            id="out_true"
            className="customHandle customHandleTrue"
            style={{ top: '25%' }}
          />
          {/* Метка TRUE рядом с handle */}
          <span
            style={{
              position: 'absolute',
              right: 18,
              top: '25%',
              transform: 'translateY(-50%)',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--ev-c-success)',
              letterSpacing: '0.04em',
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            TRUE
          </span>

          {/* Выход "false" — нижняя правая точка */}
          <Handle
            type="source"
            position={Position.Right}
            id="out_false"
            className="customHandle customHandleFalse"
            style={{ top: '75%' }}
          />
          {/* Метка FALSE рядом с handle */}
          <span
            style={{
              position: 'absolute',
              right: 18,
              top: '75%',
              transform: 'translateY(-50%)',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--ev-c-error)',
              letterSpacing: '0.04em',
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            FALSE
          </span>
        </>
      }
    >
      {condition && <div className="customNodeParam">{String(condition)}</div>}
    </BaseNode>
  )
}

// Запуск функции/скрипта.
export function RunFunctionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const funcName = data.params?.function_name ?? data.params?.function ?? ''
  return (
    <BaseNode nodeType="run_function" selected={selected}>
      {funcName && <div className="customNodeParam">{String(funcName)}()</div>}
    </BaseNode>
  )
}
