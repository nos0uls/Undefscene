import { Handle, Position } from '@xyflow/react'
import { memo, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { useNodeActionsRef } from '../NodeActionsContext'
import { createTranslator } from '../../i18n'

// Тип данных, которые React Flow передаёт в каждую ноду.
type CutsceneNodeData = {
  label?: string
  params?: Record<string, unknown>
}

// Тип пропсов, которые React Flow передаёт в custom node component.
type CutsceneNodeProps = {
  data: CutsceneNodeData
  selected?: boolean
}

// --- Flow-ноды ---

// Стартовая нода: только выход, без входа.
export const StartNode = memo(function StartNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="start" label={data.label} hasInput={false} hasOutput selected={selected} />
  )
})

// Конечная нода: только вход, без выхода.
export const EndNode = memo(function EndNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="end" label={data.label} hasInput hasOutput={false} selected={selected} />
  )
})

// Пауза: ждём N секунд.
export const WaitNode = memo(function WaitNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="wait" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.seconds', 'Time')}</span>
        <span className="customNodeParamValue">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</span>
      </div>
    </BaseNode>
  )
})

// --- Movement-ноды ---

// Перемещение актёра в точку.
export const MoveNode = memo(function MoveNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="move" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.targetPosition', 'Target')}</span>
        <span className="customNodeParamValue">{String(x)}, {String(y)}</span>
      </div>
    </BaseNode>
  )
})

// Перемещение по набору точек.
export const FollowPathNode = memo(function FollowPathNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const pointsData = Array.isArray(data.params?.points) ? data.params.points : []
  const points = pointsData.length
  return (
    <BaseNode nodeType="follow_path" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{points} {t('nodes.preview.points', 'points')}</div>
    </BaseNode>
  )
})

// Мгновенная установка позиции.
export const SetPositionNode = memo(function SetPositionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="set_position" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        @ {String(x)}, {String(y)}
      </div>
    </BaseNode>
  )
})

// Относительное перемещение актёра.
export const MoveRelativeNode = memo(function MoveRelativeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const dx = data.params?.dx ?? '?'
  const dy = data.params?.dy ?? '?'
  return (
    <BaseNode nodeType="move_relative" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.offset', 'Offset')}</span>
        <span className="customNodeParamValue">{String(dx)}, {String(dy)}</span>
      </div>
    </BaseNode>
  )
})

// Мгновенная установка относительной позиции.
export const SetPositionRelativeNode = memo(function SetPositionRelativeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const dx = data.params?.dx ?? '?'
  const dy = data.params?.dy ?? '?'
  return (
    <BaseNode nodeType="set_position_relative" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        + {String(dx)}, {String(dy)}
      </div>
    </BaseNode>
  )
})

// --- Actor-ноды ---

// Создание актёра.
export const ActorCreateNode = memo(function ActorCreateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const key = data.params?.actor_name ?? ''
  const obj = data.params?.actor_sprite ?? ''
  return (
    <BaseNode nodeType="actor_create" selected={selected}>
      <div className="customNodeParam">{String(key)}</div>
      {obj && <div className="customNodeParam">{String(obj)}</div>}
    </BaseNode>
  )
})

// Уничтожение актёра.
export const ActorDestroyNode = memo(function ActorDestroyNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="actor_destroy" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

// --- Visual-ноды ---

// Анимация спрайта.
export const AnimateNode = memo(function AnimateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  return (
    <BaseNode nodeType="animate" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      {sprite && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.fields.sprite', 'Sprite')}</span>
          <span className="customNodeParamValue">{String(sprite)}</span>
        </div>
      )}
    </BaseNode>
  )
})

// Установка конкретного кадра анимации (без смены спрайта).
export const SetAnimationFrameNode = memo(function SetAnimationFrameNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const imageIndex = data.params?.image_index ?? 0
  const imageSpeed = data.params?.image_speed ?? 1
  const pause = data.params?.pause ?? false
  return (
    <BaseNode nodeType="set_animation_frame" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Actor')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.image_index', 'Frame')}</span>
        <span className="customNodeParamValue">{String(imageIndex)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.image_speed', 'Speed')}</span>
        <span className="customNodeParamValue">{String(imageSpeed)}</span>
        {pause && <span className="customNodeParamValue"> {t('nodes.preview.paused', '(paused)')}</span>}
      </div>
    </BaseNode>
  )
})

// Установка направления взгляда.
export const SetFacingNode = memo(function SetFacingNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const direction = data.params?.direction ?? '?'
  return (
    <BaseNode nodeType="set_facing" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{t('nodes.preview.direction', 'dir:')} {String(direction)}</div>
    </BaseNode>
  )
})

// Установка глубины.
export const SetDepthNode = memo(function SetDepthNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const depth = data.params?.depth ?? '?'
  return (
    <BaseNode nodeType="set_depth" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{t('nodes.preview.depth', 'depth:')} {String(depth)}</div>
    </BaseNode>
  )
})

// --- Dialogue ---

// Диалоговая нода.
export const DialogueNode = memo(function DialogueNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const file = data.params?.file ?? ''
  const node = data.params?.node ?? ''
  return (
    <BaseNode nodeType="dialogue" selected={selected}>
      {file && <div className="customNodeParam">{String(file)}</div>}
      {node && <div className="customNodeParam">→ {String(node)}</div>}
      {data.label && !file && <div className="customNodeParam">{data.label}</div>}
    </BaseNode>
  )
})

export const WaitForDialogueNode = memo(function WaitForDialogueNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const controller = data.params?.dialogue_controller ?? ''
  return (
    <BaseNode nodeType="wait_for_dialogue" selected={selected}>
      {controller && <div className="customNodeParam">{String(controller)}</div>}
      {!controller && <div className="customNodeParam">{t('nodes.preview.activeTextbox', 'active textbox')}</div>}
    </BaseNode>
  )
})

// Установка скорости печати диалога.
export const SetDialogueSpeedNode = memo(function SetDialogueSpeedNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const speed = data.params?.speed ?? '?'
  return (
    <BaseNode nodeType="set_dialogue_speed" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.speed', 'Speed')}</span>
        <span className="customNodeParamValue">{String(speed)} {t('nodes.preview.charsPerSec', 'ch/s')}</span>
      </div>
    </BaseNode>
  )
})

// Ожидание завершения печати текста.
export const WaitTypingNode = memo(function WaitTypingNode({ selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  return (
    <BaseNode nodeType="wait_typing" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.waitForTyping', 'wait for typing')}</div>
    </BaseNode>
  )
})

// Управление поведением диалогового окна.
export const DialogueControlNode = memo(function DialogueControlNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const preventSkip = data.params?.prevent_skip ?? false
  const stayOpen = data.params?.stay_open ?? false
  const autoAdvance = data.params?.auto_advance ?? false
  const flags = useMemo(() => {
    const f: string[] = []
    if (preventSkip) f.push(t('nodes.preview.noSkip', 'no skip'))
    if (stayOpen) f.push(t('nodes.preview.stayOpen', 'stay open'))
    if (autoAdvance) f.push(t('nodes.preview.autoAdvance', 'auto advance'))
    return f
  }, [preventSkip, stayOpen, autoAdvance, t])
  return (
    <BaseNode nodeType="dialogue_control" selected={selected}>
      <div className="customNodeParam">
        {flags.length > 0 ? flags.join(', ') : t('nodes.preview.default', 'default')}
      </div>
    </BaseNode>
  )
})

// Установка портрета для следующей реплики.
export const SetPortraitNextNode = memo(function SetPortraitNextNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const emotion = data.params?.emotion ?? ''
  return (
    <BaseNode nodeType="set_portrait_next" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.emotion', 'Emotion')}</span>
        <span className="customNodeParamValue">{String(emotion)}</span>
      </div>
    </BaseNode>
  )
})

// Установка портрета немедленно.
export const SetPortraitNowNode = memo(function SetPortraitNowNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const emotion = data.params?.emotion ?? ''
  return (
    <BaseNode nodeType="set_portrait_now" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.emotion', 'Emotion')}</span>
        <span className="customNodeParamValue">{String(emotion)}</span>
      </div>
    </BaseNode>
  )
})

// Очистка диалогового окна.
export const ClearDialogueNode = memo(function ClearDialogueNode({ selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  return (
    <BaseNode nodeType="clear_dialogue" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.clearTextbox', 'clear textbox')}</div>
    </BaseNode>
  )
})

// --- Camera ---

// Камера следит за целью.
export const CameraTrackNode = memo(function CameraTrackNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="camera_track" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.seconds', 'Duration')}</span>
        <span className="customNodeParamValue">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</span>
      </div>
    </BaseNode>
  )
})

// Камера панорамирует к точке.
export const CameraPanNode = memo(function CameraPanNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="camera_pan" selected={selected}>
      <div className="customNodeParam">
        → {String(x)}, {String(y)}
      </div>
      <div className="customNodeParam">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

// --- Logic ---

// Параллельное выполнение делаем как ПАРУ нод:
// - parallel_start (fork): один вход, N выходов
// - parallel_join (join): N входов, один выход
// Каждая нода имеет кнопку "Add Branch", чтобы добавить ещё одну пару портов.

// Вспомогательная функция: рисуем список handles по веткам.
function renderParallelHandles(
  kind: 'source' | 'target',
  branchIds: string[],
  hidden = false
): React.JSX.Element[] {
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
        style={{ top: `${topPct}%`, opacity: hidden ? 0 : undefined, pointerEvents: hidden ? 'none' : undefined }}
      />
    )
  })
}

// Один общий handle для shared-режима.
// Под капотом ветка всё равно назначается автоматически по порядку подключений.
function renderSharedParallelHandle(kind: 'source' | 'target'): React.JSX.Element {
  const handleId = kind === 'source' ? 'out_shared' : 'in_shared'
  return (
    <Handle
      key={handleId}
      type={kind}
      id={handleId}
      position={kind === 'source' ? Position.Right : Position.Left}
      className="customHandle customHandleShared"
      style={{ top: '50%' }}
    />
  )
}

// Fork-нода: много выходов.
export const ParallelStartNode = memo(function ParallelStartNode(props: CutsceneNodeProps & { id?: string }): React.JSX.Element {
  const id = String(props.id ?? '')
  const data = props.data
  const selected = Boolean(props.selected)
  const branches = (
    Array.isArray(data.params?.branches) ? data.params?.branches : ['b0']
  ) as string[]
  const { preferences } = usePreferencesContext()
  const { addBranchRef, removeBranchRef } = useNodeActionsRef()
  const portMode = preferences.parallelBranchPortMode

  // После 4 веток стандартной высоты уже мало: handles начинают стоять слишком плотно.
  // Поэтому плавно подращиваем minHeight, чтобы между точками оставался читаемый интервал.
  const extraBranchCount = Math.max(0, branches.length - 4)
  const parallelMinHeight = extraBranchCount > 0 ? 90 + extraBranchCount * 18 : undefined
  const baseNodeStyle = useMemo(
    () => ({ minHeight: parallelMinHeight }),
    [parallelMinHeight]
  )
  const extraHandles = useMemo(
    () => (
      <>
        {/* Скрытый handle для внутренней связи пары start→join */}
        <Handle
          type="source"
          id="__pair"
          position={Position.Right}
          className="customHandle"
          style={{ top: '50%', opacity: 0, pointerEvents: 'none' }}
        />
        {portMode === 'separate' ? (
          renderParallelHandles('source', branches)
        ) : (
          <>
            {renderParallelHandles('source', branches, true)}
            {renderSharedParallelHandle('source')}
          </>
        )}
      </>
    ),
    [portMode, branches]
  )

  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  return (
    <BaseNode nodeType="parallel_start"
      selected={selected}
      style={baseNodeStyle}
      hasOutput={false}
      extraHandles={extraHandles}
    >
      <div className="customNodeButtonRow">
        <button
          className="customNodeButton"
          type="button"
          onClick={() => addBranchRef.current?.(id)}
        >
          {t('editor.addBranch', '+ Branch')}
        </button>
        <button
          className="customNodeButton customNodeButtonDanger"
          type="button"
          onClick={() => removeBranchRef.current?.(id)}
          disabled={branches.length <= 1}
        >
          {t('editor.removeBranch', '- Branch')}
        </button>
      </div>
    </BaseNode>
  )
})

// Join-нода: много входов.
export const ParallelJoinNode = memo(function ParallelJoinNode(props: CutsceneNodeProps & { id?: string }): React.JSX.Element {
  const id = String((props as { id?: string }).id ?? '')
  const data = props.data
  const selected = Boolean(props.selected)
  const branches = (
    Array.isArray(data.params?.branches) ? data.params?.branches : ['b0']
  ) as string[]
  const pairId = typeof data.params?.pairId === 'string' ? String(data.params?.pairId) : ''
  const { preferences } = usePreferencesContext()
  const { addBranchRef, removeBranchRef } = useNodeActionsRef()
  const portMode = preferences.parallelBranchPortMode

  // Для join используем ту же формулу роста, что и для start,
  // чтобы пара нод визуально оставалась одной высоты.
  const extraBranchCount = Math.max(0, branches.length - 4)
  const parallelMinHeight = extraBranchCount > 0 ? 90 + extraBranchCount * 18 : undefined
  const baseNodeStyle = useMemo(
    () => ({ minHeight: parallelMinHeight }),
    [parallelMinHeight]
  )
  const extraHandles = useMemo(
    () => (
      <>
        {/* Скрытый handle для внутренней связи пары start→join */}
        <Handle
          type="target"
          id="__pair"
          position={Position.Left}
          className="customHandle"
          style={{ top: '50%', opacity: 0, pointerEvents: 'none' }}
        />
        {portMode === 'separate' ? (
          renderParallelHandles('target', branches)
        ) : (
          <>
            {renderParallelHandles('target', branches, true)}
            {renderSharedParallelHandle('target')}
          </>
        )}
      </>
    ),
    [portMode, branches]
  )

  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  return (
    <BaseNode nodeType="parallel_join"
      selected={selected}
      style={baseNodeStyle}
      hasInput={false}
      extraHandles={extraHandles}
    >
      <div className="customNodeButtonRow">
        <button
          className="customNodeButton"
          type="button"
          // Для join мы добавляем ветку через start-id (pairId).
          onClick={() => addBranchRef.current?.(pairId || id)}
        >
          {t('editor.addBranch', '+ Branch')}
        </button>
        <button
          className="customNodeButton customNodeButtonDanger"
          type="button"
          onClick={() => removeBranchRef.current?.(pairId || id)}
          disabled={branches.length <= 1}
        >
          {t('editor.removeBranch', '- Branch')}
        </button>
      </div>
    </BaseNode>
  )
})

// Ветвление по условию: вход, выход true (вверху справа), выход false (внизу справа).
// Увеличена высота и разнесены handles для удобства.
export const BranchNode = memo(function BranchNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const condition = data.params?.condition ?? ''

  // Выносим inline style в useMemo для избежания создания новых объектов на каждом рендере
  const trueLabelStyle = useMemo((): CSSProperties => ({
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
  }), [])

  const falseLabelStyle = useMemo((): CSSProperties => ({
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
  }), [])
  return (
    <BaseNode nodeType="branch"
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
            style={trueLabelStyle}
          >
            {t('editor.true', 'TRUE')}
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
            style={falseLabelStyle}
          >
            {t('editor.false', 'FALSE')}
          </span>
        </>
      }
    >
      {condition && <div className="customNodeParam">{String(condition)}</div>}
    </BaseNode>
  )
})

// --- Дополнительные Camera-ноды ---

// Тряска камеры.
export const CameraShakeNode = memo(function CameraShakeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  const magnitude = data.params?.magnitude ?? 4
  const magnitudeX = data.params?.magnitude_x
  const magnitudeY = data.params?.magnitude_y
  const hasSeparateMagnitudes = typeof magnitudeX === 'number' || typeof magnitudeY === 'number'
  return (
    <BaseNode nodeType="camera_shake" selected={selected}>
      <div className="customNodeParam">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</div>
      {hasSeparateMagnitudes ? (
        <div className="customNodeParam">
          {t('nodes.preview.magnitude', 'mag:')} {String(magnitudeX ?? magnitude)},{String(magnitudeY ?? magnitude)}
        </div>
      ) : (
        <div className="customNodeParam">{t('nodes.preview.magnitude', 'mag:')} {String(magnitude)}</div>
      )}
    </BaseNode>
  )
})

// --- Дополнительные Visual-ноды ---

// Включить/выключить авто-поворот.
export const AutoFacingNode = memo(function AutoFacingNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode nodeType="auto_facing" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

// Включить/выключить авто-ходьбу.
export const AutoWalkNode = memo(function AutoWalkNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode nodeType="auto_walk" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

// Запуск функции/скрипта.
export const RunFunctionNode = memo(function RunFunctionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const funcName = data.params?.function ?? ''
  return (
    <BaseNode nodeType="run_function" selected={selected}>
      {funcName && <div className="customNodeParam">{String(funcName)}()</div>}
    </BaseNode>
  )
})

export const TweenNode = memo(function TweenNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const kind = data.params?.kind ?? 'instance'
  const target = data.params?.target ?? 'camera'
  const property = data.params?.prop ?? ''
  const to = data.params?.end_value ?? '?'
  return (
    <BaseNode nodeType="tween" selected={selected}>
      <div className="customNodeParam">{String(kind) === 'camera' ? 'camera' : String(target)}</div>
      <div className="customNodeParam">{String(property)} → {String(to)}</div>
    </BaseNode>
  )
})

export const SetPropertyNode = memo(function SetPropertyNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const kind = data.params?.kind ?? 'instance'
  const target = data.params?.target ?? 'camera'
  const property = data.params?.property ?? ''
  const value = data.params?.value ?? '?'
  return (
    <BaseNode nodeType="set_property" selected={selected}>
      <div className="customNodeParam">{String(kind) === 'camera' ? 'camera' : String(target)}</div>
      <div className="customNodeParam">{String(property)} = {String(value)}</div>
    </BaseNode>
  )
})

export const FadeInNode = memo(function FadeInNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="fade_in" selected={selected}>
      <div className="customNodeParam">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const FadeOutNode = memo(function FadeOutNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode nodeType="fade_out" selected={selected}>
      <div className="customNodeParam">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const PlaySFXNode = memo(function PlaySFXNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const sound = data.params?.sound ?? ''
  return (
    <BaseNode nodeType="play_sfx" selected={selected}>
      {sound && <div className="customNodeParam">{String(sound)}</div>}
    </BaseNode>
  )
})

export const PlayMusicNode = memo(function PlayMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const sound = data.params?.sound ?? ''
  const volume = data.params?.volume ?? 1
  return (
    <BaseNode nodeType="play_music" selected={selected}>
      {sound && <div className="customNodeParam">{String(sound)}</div>}
      <div className="customNodeParam">{t('nodes.preview.volume', 'vol')}: {String(volume)}</div>
    </BaseNode>
  )
})

export const StopMusicNode = memo(function StopMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="stop_music" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const MusicVolumeNode = memo(function MusicVolumeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const volume = data.params?.volume ?? 1
  const fade = data.params?.fade ?? 0.5
  return (
    <BaseNode nodeType="music_volume" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.volume', 'vol')}: {String(volume)}</div>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const MusicDuckNode = memo(function MusicDuckNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const multiplier = data.params?.multiplier ?? 0.3
  const fade = data.params?.fade ?? 0.3
  return (
    <BaseNode nodeType="music_duck" selected={selected}>
      <div className="customNodeParam">x{String(multiplier)}</div>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const MusicUnduckNode = memo(function MusicUnduckNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 0.3
  return (
    <BaseNode nodeType="music_unduck" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const MusicPitchNode = memo(function MusicPitchNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const pitch = data.params?.pitch ?? 1
  return (
    <BaseNode nodeType="music_pitch" selected={selected}>
      <div className="customNodeParam">{t('nodes.fields.pitch', 'pitch')}: {String(pitch)}</div>
    </BaseNode>
  )
})

export const MusicPauseNode = memo(function MusicPauseNode({ selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="music_pause" selected={selected} />
  )
})

export const MusicResumeNode = memo(function MusicResumeNode({ selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="music_resume" selected={selected} />
  )
})

export const PlayBossMusicNode = memo(function PlayBossMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const calm = data.params?.calm ?? ''
  const battle = data.params?.battle ?? ''
  return (
    <BaseNode nodeType="play_boss_music" selected={selected}>
      {calm && <div className="customNodeParam">{t('nodes.fields.calm', 'calm')}: {String(calm)}</div>}
      {battle && <div className="customNodeParam">{t('nodes.fields.battle', 'battle')}: {String(battle)}</div>}
    </BaseNode>
  )
})

export const StopBossMusicNode = memo(function StopBossMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="stop_boss_music" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const BossMusicPhaseNode = memo(function BossMusicPhaseNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const fade = data.params?.fade ?? 0.5
  return (
    <BaseNode nodeType="boss_music_phase" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const PlayMusicIntroNode = memo(function PlayMusicIntroNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const intro = data.params?.intro ?? ''
  const loop = data.params?.loop ?? ''
  return (
    <BaseNode nodeType="play_music_intro" selected={selected}>
      {intro && <div className="customNodeParam">{t('nodes.fields.intro', 'intro')}: {String(intro)}</div>}
      {loop && <div className="customNodeParam">{t('nodes.fields.loop', 'loop')}: {String(loop)}</div>}
    </BaseNode>
  )
})

export const PlayMusicIntroLayeredNode = memo(function PlayMusicIntroLayeredNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const intro = data.params?.intro ?? ''
  const calm = data.params?.calm ?? ''
  const battle = data.params?.battle ?? ''
  return (
    <BaseNode nodeType="play_music_intro_layered" selected={selected}>
      {intro && <div className="customNodeParam">{t('nodes.fields.intro', 'intro')}: {String(intro)}</div>}
      {calm && <div className="customNodeParam">{t('nodes.fields.calm', 'calm')}: {String(calm)}</div>}
      {battle && <div className="customNodeParam">{t('nodes.fields.battle', 'battle')}: {String(battle)}</div>}
    </BaseNode>
  )
})

export const CrossfadeMusicNode = memo(function CrossfadeMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const intensity = data.params?.intensity ?? 0.5
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="crossfade_music" selected={selected}>
      <div className="customNodeParam">{t('nodes.fields.intensity', 'intensity')}: {String(intensity)}</div>
      <div className="customNodeParam">{t('nodes.preview.fade', 'fade')}: {String(fade)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const EmoteNode = memo(function EmoteNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  const wait = data.params?.wait === true

  const waitStyle = useMemo(() => ({ opacity: 0.5, fontSize: '0.9em' }), [])
  return (
    <BaseNode nodeType="emote" selected={selected}>
      <div className="customNodeParam">
        {String(target)} {wait && <span style={waitStyle}>(wait)</span>}
      </div>
      {sprite && <div className="customNodeParam">{String(sprite)}</div>}
    </BaseNode>
  )
})

export const JumpNode = memo(function JumpNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode nodeType="jump" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">→ {String(x)}, {String(y)}</div>
    </BaseNode>
  )
})

export const HaltNode = memo(function HaltNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="halt" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

export const FlipNode = memo(function FlipNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const flipped = data.params?.flipped ?? true
  return (
    <BaseNode nodeType="flip" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(flipped)}</div>
    </BaseNode>
  )
})

export const SpinNode = memo(function SpinNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const speed = data.params?.speed ?? '?'
  return (
    <BaseNode nodeType="spin" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{t('nodes.fields.speed', 'speed')}: {String(speed)}</div>
    </BaseNode>
  )
})

export const ShakeObjectNode = memo(function ShakeObjectNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const magnitude = data.params?.magnitude ?? 4
  const magnitudeX = data.params?.magnitude_x
  const magnitudeY = data.params?.magnitude_y
  const hasSeparateMagnitudes = typeof magnitudeX === 'number' || typeof magnitudeY === 'number'
  return (
    <BaseNode nodeType="shake_object" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      {hasSeparateMagnitudes ? (
        <div className="customNodeParam">
          {t('nodes.preview.magnitude', 'mag:')} {String(magnitudeX ?? magnitude)},{String(magnitudeY ?? magnitude)}
        </div>
      ) : (
        <div className="customNodeParam">{t('nodes.preview.magnitude', 'mag:')} {String(magnitude)}</div>
      )}
    </BaseNode>
  )
})

export const SetVisibleNode = memo(function SetVisibleNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const visible = data.params?.visible ?? true
  return (
    <BaseNode nodeType="set_visible" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(visible)}</div>
    </BaseNode>
  )
})

export const InstantModeNode = memo(function InstantModeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode nodeType="instant_mode" selected={selected}>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

export const MarkNodeNode = memo(function MarkNodeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const name = data.params?.name ?? ''
  return (
    <BaseNode nodeType="mark_node" selected={selected}>
      <div className="customNodeParam">{String(name)}</div>
    </BaseNode>
  )
})

export const CameraTrackUntilStopNode = memo(function CameraTrackUntilStopNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const ox = data.params?.offset_x ?? 0
  const oy = data.params?.offset_y ?? 0
  return (
    <BaseNode nodeType="camera_track_until_stop" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">ox:{String(ox)} oy:{String(oy)}</div>
    </BaseNode>
  )
})

export const CameraCenterNode = memo(function CameraCenterNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const x = data.params?.x ?? 0
  const y = data.params?.y ?? 0
  return (
    <BaseNode nodeType="camera_center" selected={selected}>
      <div className="customNodeParam">({String(x)}, {String(y)})</div>
    </BaseNode>
  )
})

export const CameraPanObjNode = memo(function CameraPanObjNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? 1
  return (
    <BaseNode nodeType="camera_pan_obj" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')}</div>
    </BaseNode>
  )
})

export const TweenCameraNode = memo(function TweenCameraNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const property = data.params?.property ?? ''
  const to_value = data.params?.to_value ?? 0
  const seconds = data.params?.seconds ?? 1
  const easing = data.params?.easing ?? 'linear'
  return (
    <BaseNode nodeType="tween_camera" selected={selected}>
      <div className="customNodeParam">{t('nodes.preview.camera', 'camera')}.{String(property)} → {String(to_value)}</div>
      <div className="customNodeParam">{String(seconds)}{t('nodes.preview.secondsSuffix', 's')} {String(easing)}</div>
    </BaseNode>
  )
})

// Partial Control — переключает уровень контроля игрока во время катсцены.
export const PartialControlNode = memo(function PartialControlNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const control_type = data.params?.control_type ?? 0
  const whitelist = Array.isArray(data.params?.whitelist) ? data.params.whitelist : []
  return (
    <BaseNode nodeType="partial_control" selected={selected}>
      <div className="customNodeParam">{t('nodes.fields.control_type', 'type')}: {String(control_type)}</div>
      {control_type === 1 && <div className="customNodeParam">{t('nodes.fields.whitelist', 'whitelist')}: {whitelist.length} {t('nodes.preview.items', 'items')}</div>}
    </BaseNode>
  )
})

// Wait for Interact — ждёт взаимодействия игрока с объектом.
export const WaitInteractNode = memo(function WaitInteractNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const timeout = data.params?.timeout ?? 0
  const timeoutAction = data.params?.timeout_action ?? 'continue'
  return (
    <BaseNode nodeType="wait_for_interact" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      {Number(timeout) > 0 && <div className="customNodeParam">{t('nodes.fields.timeout', 'timeout')}: {String(timeout)}{t('nodes.preview.secondsSuffix', 's')}</div>}
      {timeoutAction !== 'continue' && <div className="customNodeParam">{t('nodes.preview.onTimeout', 'on timeout')}: {String(timeoutAction)}</div>}
    </BaseNode>
  )
})

// Wait Until — ждёт, пока global-переменная не станет равна указанному значению.
export const WaitUntilNode = memo(function WaitUntilNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const conditionVar = data.params?.condition_var ?? ''
  const conditionEquals = data.params?.condition_equals ?? ''
  const timeout = data.params?.timeout_seconds ?? 0
  return (
    <BaseNode nodeType="wait_until" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.wait', 'Wait')}</span>
        <span className="customNodeParamValue">{String(conditionVar)} = {String(conditionEquals)}</span>
      </div>
      {Number(timeout) > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.fields.timeout_seconds', 'Timeout')}</span>
          <span className="customNodeParamValue">{String(timeout)}{t('nodes.preview.secondsSuffix', 's')}</span>
        </div>
      )}
    </BaseNode>
  )
})

// Set Flag — устанавливает global.flag[key] = value.
export const SetFlagNode = memo(function SetFlagNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const key = data.params?.key ?? ''
  const value = data.params?.value ?? 0
  return (
    <BaseNode nodeType="set_flag" selected={selected}>
      <div className="customNodeParam">{String(key)} = {String(value)}</div>
    </BaseNode>
  )
})

// Spawn Entity — создаёт объект в runtime.
export const SpawnEntityNode = memo(function SpawnEntityNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const obj = data.params?.object ?? ''
  const x = data.params?.x ?? 0
  const y = data.params?.y ?? 0
  const persistent = data.params?.persistent ?? false
  return (
    <BaseNode nodeType="spawn_entity" selected={selected}>
      <div className="customNodeParam">{String(obj)}</div>
      <div className="customNodeParam">({String(x)}, {String(y)})</div>
      {persistent && <div className="customNodeParam">{t('nodes.fields.persistent', 'persistent')}</div>}
    </BaseNode>
  )
})

// Destroy Entity — уничтожает объект.
export const DestroyEntityNode = memo(function DestroyEntityNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="destroy_entity" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

// Set Plot — устанавливает глобальную переменную сюжета.
export const SetPlotNode = memo(function SetPlotNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const value = data.params?.value ?? 0
  return (
    <BaseNode nodeType="set_plot" selected={selected}>
      <div className="customNodeParam">plot = {String(value)}</div>
    </BaseNode>
  )
})

// Schedule Action — отложенный запуск одного fire-and-forget действия.
export const ScheduleActionNode = memo(function ScheduleActionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const delay = data.params?.delay_seconds ?? '?'
  const actionType = data.params?.action_type ?? ''
  const blocking = data.params?.blocking ?? false
  const tag = data.params?.tag ?? ''
  return (
    <BaseNode nodeType="schedule_action" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.delay_seconds', 'Delay')}</span>
        <span className="customNodeParamValue">{String(delay)}{t('nodes.preview.secondsSuffix', 's')}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.action_type', 'Action')}</span>
        <span className="customNodeParamValue">{String(actionType)}</span>
      </div>
      {blocking && <div className="customNodeParam">{t('nodes.fields.blocking', 'blocking')}</div>}
      {tag && <div className="customNodeParam">#{String(tag)}</div>}
    </BaseNode>
  )
})

// Attach To Target — привязка актёра к родителю с оффсетами.
export const AttachToTargetNode = memo(function AttachToTargetNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target_ref ?? ''
  const parent = data.params?.parent_ref ?? ''
  const offsetX = data.params?.offset_x ?? 0
  const offsetY = data.params?.offset_y ?? 0
  const duration = data.params?.duration_seconds ?? 0
  return (
    <BaseNode nodeType="attach_to_target" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target_ref', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.parent_ref', 'Parent')}</span>
        <span className="customNodeParamValue">{String(parent)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.offset', 'Offset')}</span>
        <span className="customNodeParamValue">{String(offsetX)}, {String(offsetY)}</span>
      </div>
      {Number(duration) > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.fields.duration_seconds', 'Duration')}</span>
          <span className="customNodeParamValue">{String(duration)}{t('nodes.preview.secondsSuffix', 's')}</span>
        </div>
      )}
    </BaseNode>
  )
})

// Checkpoint State — создаёт снимок состояния катсцены.
export const CheckpointStateNode = memo(function CheckpointStateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const id = data.params?.checkpoint_id ?? ''
  const includeActors = data.params?.include_actors === true
  const includePlayer = data.params?.include_player === true
  const includeCamera = data.params?.include_camera === true
  const includeMusic = data.params?.include_music === true
  const globals = typeof data.params?.include_globals === 'string' ? data.params.include_globals.trim() : ''
  const instances = typeof data.params?.include_instances === 'string' ? data.params.include_instances.trim() : ''
  const cats = useMemo(() => {
    const c: string[] = []
    if (includeActors) c.push(t('nodes.preview.actors', 'actors'))
    if (includePlayer) c.push(t('nodes.preview.player', 'player'))
    if (includeCamera) c.push(t('nodes.preview.camera', 'camera'))
    if (includeMusic) c.push(t('nodes.preview.music', 'music'))
    if (globals) c.push(t('nodes.preview.globals', 'globals'))
    if (instances) c.push(t('nodes.preview.instances', 'instances'))
    return c
  }, [includeActors, includePlayer, includeCamera, includeMusic, globals, instances, t])
  return (
    <BaseNode nodeType="checkpoint_state" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.checkpoint_id', 'ID')}</span>
        <span className="customNodeParamValue">{String(id)}</span>
      </div>
      {cats.length > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.preview.include', 'Include')}</span>
          <span className="customNodeParamValue">{cats.join(', ')}</span>
        </div>
      )}
    </BaseNode>
  )
})

// Restore State — восстанавливает состояние из checkpoint.
export const RestoreStateNode = memo(function RestoreStateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const id = data.params?.checkpoint_id ?? ''
  const cleanupTransients = data.params?.cleanup_transients === true
  const restoreCamera = data.params?.restore_camera === true
  const restoreMusic = data.params?.restore_music === true
  const onMissing = typeof data.params?.on_missing === 'string' ? data.params.on_missing : 'warn'
  const opts = useMemo(() => {
    const o: string[] = []
    if (cleanupTransients) o.push(t('nodes.preview.cleanup', 'cleanup'))
    if (restoreCamera) o.push(t('nodes.preview.camera', 'camera'))
    if (restoreMusic) o.push(t('nodes.preview.music', 'music'))
    return o
  }, [cleanupTransients, restoreCamera, restoreMusic, t])
  return (
    <BaseNode nodeType="restore_state" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.restore', 'Restore')}</span>
        <span className="customNodeParamValue">{String(id)}</span>
      </div>
      {opts.length > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.preview.options', 'Options')}</span>
          <span className="customNodeParamValue">{opts.join(', ')}</span>
        </div>
      )}
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.on_missing', 'On Missing')}</span>
        <span className="customNodeParamValue">{String(onMissing)}</span>
      </div>
    </BaseNode>
  )
})

// Detach — отвязка актёра от родителя.
export const DetachNode = memo(function DetachNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target_ref ?? ''
  const destroy = data.params?.destroy_after_detach ?? false
  return (
    <BaseNode nodeType="detach" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target_ref', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      {destroy && <div className="customNodeParam">{t('nodes.preview.destroy', 'destroy')}</div>}
    </BaseNode>
  )
})
