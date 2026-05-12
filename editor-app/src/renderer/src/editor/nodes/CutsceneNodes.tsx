import { Handle, Position } from '@xyflow/react'
import { memo, useMemo } from 'react'
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
    <BaseNode  nodeType="start" label={data.label} hasInput={false} hasOutput selected={selected} />
  )
})

// Конечная нода: только вход, без выхода.
export const EndNode = memo(function EndNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode  nodeType="end" label={data.label} hasInput hasOutput={false} selected={selected} />
  )
})

// Пауза: ждём N секунд.
export const WaitNode = memo(function WaitNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode  nodeType="wait" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.seconds', 'Time')}</span>
        <span className="customNodeParamValue">{String(seconds)}s</span>
      </div>
    </BaseNode>
  )
})

// --- Movement-ноды ---

// Перемещение актёра в точку.
export const MoveNode = memo(function MoveNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode  nodeType="move" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Actor</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Target</span>
        <span className="customNodeParamValue">{String(x)}, {String(y)}</span>
      </div>
    </BaseNode>
  )
})

// Перемещение по набору точек.
export const FollowPathNode = memo(function FollowPathNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const pointsData = Array.isArray(data.params?.points) ? data.params.points : (Array.isArray(data.params?.path) ? data.params.path : [])
  const points = pointsData.length
  return (
    <BaseNode  nodeType="follow_path" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{points} points</div>
    </BaseNode>
  )
})

// Мгновенная установка позиции.
export const SetPositionNode = memo(function SetPositionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  return (
    <BaseNode  nodeType="set_position" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">
        @ {String(x)}, {String(y)}
      </div>
    </BaseNode>
  )
})

// Относительное перемещение актёра.
export const MoveRelativeNode = memo(function MoveRelativeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const dx = data.params?.dx ?? '?'
  const dy = data.params?.dy ?? '?'
  return (
    <BaseNode  nodeType="move_relative" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Actor</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Offset</span>
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
    <BaseNode  nodeType="set_position_relative" selected={selected}>
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
  const key = data.params?.actor_name ?? data.params?.key ?? ''
  const obj = data.params?.actor_sprite ?? data.params?.sprite_or_object ?? ''
  return (
    <BaseNode  nodeType="actor_create" selected={selected}>
      <div className="customNodeParam">{String(key)}</div>
      {obj && <div className="customNodeParam">{String(obj)}</div>}
    </BaseNode>
  )
})

// Уничтожение актёра.
export const ActorDestroyNode = memo(function ActorDestroyNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode  nodeType="actor_destroy" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

// --- Visual-ноды ---

// Анимация спрайта.
export const AnimateNode = memo(function AnimateNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  return (
    <BaseNode  nodeType="animate" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Actor</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      {sprite && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">Sprite</span>
          <span className="customNodeParamValue">{String(sprite)}</span>
        </div>
      )}
    </BaseNode>
  )
})

// Установка конкретного кадра анимации (без смены спрайта).
export const SetAnimationFrameNode = memo(function SetAnimationFrameNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const imageIndex = data.params?.image_index ?? 0
  const imageSpeed = data.params?.image_speed ?? 1
  const pause = data.params?.pause ?? false
  return (
    <BaseNode  nodeType="set_animation_frame" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Actor</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Frame</span>
        <span className="customNodeParamValue">{String(imageIndex)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Speed</span>
        <span className="customNodeParamValue">{String(imageSpeed)}</span>
        {pause && <span className="customNodeParamValue"> (paused)</span>}
      </div>
    </BaseNode>
  )
})

// Установка направления взгляда.
export const SetFacingNode = memo(function SetFacingNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const direction = data.params?.direction ?? '?'
  return (
    <BaseNode  nodeType="set_facing" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">dir: {String(direction)}</div>
    </BaseNode>
  )
})

// Установка глубины.
export const SetDepthNode = memo(function SetDepthNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const depth = data.params?.depth ?? '?'
  return (
    <BaseNode  nodeType="set_depth" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">depth: {String(depth)}</div>
    </BaseNode>
  )
})

// --- Dialogue ---

// Диалоговая нода.
export const DialogueNode = memo(function DialogueNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const file = data.params?.file ?? ''
  const node = data.params?.node ?? ''
  return (
    <BaseNode  nodeType="dialogue" selected={selected}>
      {file && <div className="customNodeParam">{String(file)}</div>}
      {node && <div className="customNodeParam">→ {String(node)}</div>}
      {data.label && !file && <div className="customNodeParam">{data.label}</div>}
    </BaseNode>
  )
})

export const WaitForDialogueNode = memo(function WaitForDialogueNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const controller = data.params?.dialogue_controller ?? ''
  return (
    <BaseNode  nodeType="wait_for_dialogue" selected={selected}>
      {controller && <div className="customNodeParam">{String(controller)}</div>}
      {!controller && <div className="customNodeParam">active textbox</div>}
    </BaseNode>
  )
})

// --- Camera ---

// Камера следит за целью.
export const CameraTrackNode = memo(function CameraTrackNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode  nodeType="camera_track" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Target</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Duration</span>
        <span className="customNodeParamValue">{String(seconds)}s</span>
      </div>
    </BaseNode>
  )
})

// Камера панорамирует к точке.
export const CameraPanNode = memo(function CameraPanNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const x = data.params?.x ?? '?'
  const y = data.params?.y ?? '?'
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode  nodeType="camera_pan" selected={selected}>
      <div className="customNodeParam">
        → {String(x)}, {String(y)}
      </div>
      <div className="customNodeParam">{String(seconds)}s</div>
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
    <BaseNode       nodeType="parallel_start"
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
    <BaseNode       nodeType="parallel_join"
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
  return (
    <BaseNode       nodeType="branch"
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
  const seconds = data.params?.seconds ?? '?'
  const magnitude = data.params?.magnitude ?? 4
  const magnitudeX = data.params?.magnitude_x
  const magnitudeY = data.params?.magnitude_y
  const hasSeparateMagnitudes = typeof magnitudeX === 'number' || typeof magnitudeY === 'number'
  return (
    <BaseNode  nodeType="camera_shake" selected={selected}>
      <div className="customNodeParam">{String(seconds)}s</div>
      {hasSeparateMagnitudes ? (
        <div className="customNodeParam">
          mag: {String(magnitudeX ?? magnitude)},{String(magnitudeY ?? magnitude)}
        </div>
      ) : (
        <div className="customNodeParam">mag: {String(magnitude)}</div>
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
    <BaseNode  nodeType="auto_facing" selected={selected}>
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
    <BaseNode  nodeType="auto_walk" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

// Запуск функции/скрипта.
export const RunFunctionNode = memo(function RunFunctionNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const funcName = data.params?.function_name ?? data.params?.function ?? ''
  return (
    <BaseNode  nodeType="run_function" selected={selected}>
      {funcName && <div className="customNodeParam">{String(funcName)}()</div>}
    </BaseNode>
  )
})

export const TweenNode = memo(function TweenNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const kind = data.params?.kind ?? 'instance'
  const target = data.params?.target ?? 'camera'
  const property = data.params?.prop ?? data.params?.property ?? ''
  const to = data.params?.end_value ?? data.params?.to ?? '?'
  return (
    <BaseNode  nodeType="tween" selected={selected}>
      <div className="customNodeParam">{String(kind) === 'camera' ? 'camera' : String(target)}</div>
      <div className="customNodeParam">{String(property)} → {String(to)}</div>
    </BaseNode>
  )
})

export const SetPropertyNode = memo(function SetPropertyNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const kind = data.params?.kind ?? 'instance'
  const target = data.params?.target ?? 'camera'
  const property = data.params?.prop ?? data.params?.property ?? ''
  const value = data.params?.value ?? '?'
  return (
    <BaseNode  nodeType="set_property" selected={selected}>
      <div className="customNodeParam">{String(kind) === 'camera' ? 'camera' : String(target)}</div>
      <div className="customNodeParam">{String(property)} = {String(value)}</div>
    </BaseNode>
  )
})

export const FadeInNode = memo(function FadeInNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode  nodeType="fade_in" selected={selected}>
      <div className="customNodeParam">{String(seconds)}s</div>
    </BaseNode>
  )
})

export const FadeOutNode = memo(function FadeOutNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const seconds = data.params?.seconds ?? '?'
  return (
    <BaseNode  nodeType="fade_out" selected={selected}>
      <div className="customNodeParam">{String(seconds)}s</div>
    </BaseNode>
  )
})

export const PlaySFXNode = memo(function PlaySFXNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const sound = data.params?.sound ?? ''
  return (
    <BaseNode  nodeType="play_sfx" selected={selected}>
      {sound && <div className="customNodeParam">{String(sound)}</div>}
    </BaseNode>
  )
})

export const PlayMusicNode = memo(function PlayMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const sound = data.params?.sound ?? ''
  const volume = data.params?.volume ?? 1
  return (
    <BaseNode nodeType="play_music" selected={selected}>
      {sound && <div className="customNodeParam">{String(sound)}</div>}
      <div className="customNodeParam">vol: {String(volume)}</div>
    </BaseNode>
  )
})

export const StopMusicNode = memo(function StopMusicNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const fade = data.params?.fade ?? 1
  return (
    <BaseNode nodeType="stop_music" selected={selected}>
      <div className="customNodeParam">fade: {String(fade)}s</div>
    </BaseNode>
  )
})

export const MusicVolumeNode = memo(function MusicVolumeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const volume = data.params?.volume ?? 1
  const fade = data.params?.fade ?? 0.5
  return (
    <BaseNode nodeType="music_volume" selected={selected}>
      <div className="customNodeParam">vol: {String(volume)}</div>
      <div className="customNodeParam">fade: {String(fade)}s</div>
    </BaseNode>
  )
})

export const MusicDuckNode = memo(function MusicDuckNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const multiplier = data.params?.multiplier ?? 0.3
  const fade = data.params?.fade ?? 0.3
  return (
    <BaseNode nodeType="music_duck" selected={selected}>
      <div className="customNodeParam">x{String(multiplier)}</div>
      <div className="customNodeParam">fade: {String(fade)}s</div>
    </BaseNode>
  )
})

export const MusicUnduckNode = memo(function MusicUnduckNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const fade = data.params?.fade ?? 0.3
  return (
    <BaseNode nodeType="music_unduck" selected={selected}>
      <div className="customNodeParam">fade: {String(fade)}s</div>
    </BaseNode>
  )
})

export const MusicPitchNode = memo(function MusicPitchNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const pitch = data.params?.pitch ?? 1
  return (
    <BaseNode nodeType="music_pitch" selected={selected}>
      <div className="customNodeParam">pitch: {String(pitch)}</div>
    </BaseNode>
  )
})

export const MusicPauseNode = memo(function MusicPauseNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="music_pause" selected={selected} />
  )
})

export const MusicResumeNode = memo(function MusicResumeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  return (
    <BaseNode nodeType="music_resume" selected={selected} />
  )
})

export const EmoteNode = memo(function EmoteNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const sprite = data.params?.sprite ?? ''
  const wait = data.params?.wait === true
  return (
    <BaseNode  nodeType="emote" selected={selected}>
      <div className="customNodeParam">
        {String(target)} {wait && <span style={{ opacity: 0.5, fontSize: '0.9em' }}>(wait)</span>}
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
    <BaseNode  nodeType="jump" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">→ {String(x)}, {String(y)}</div>
    </BaseNode>
  )
})

export const HaltNode = memo(function HaltNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode  nodeType="halt" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

export const FlipNode = memo(function FlipNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const flipped = data.params?.flipped ?? true
  return (
    <BaseNode  nodeType="flip" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(flipped)}</div>
    </BaseNode>
  )
})

export const SpinNode = memo(function SpinNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const speed = data.params?.speed ?? '?'
  return (
    <BaseNode  nodeType="spin" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">speed: {String(speed)}</div>
    </BaseNode>
  )
})

export const ShakeObjectNode = memo(function ShakeObjectNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const magnitude = data.params?.magnitude ?? 4
  const magnitudeX = data.params?.magnitude_x
  const magnitudeY = data.params?.magnitude_y
  const hasSeparateMagnitudes = typeof magnitudeX === 'number' || typeof magnitudeY === 'number'
  return (
    <BaseNode  nodeType="shake_object" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      {hasSeparateMagnitudes ? (
        <div className="customNodeParam">
          mag: {String(magnitudeX ?? magnitude)},{String(magnitudeY ?? magnitude)}
        </div>
      ) : (
        <div className="customNodeParam">mag: {String(magnitude)}</div>
      )}
    </BaseNode>
  )
})

export const SetVisibleNode = memo(function SetVisibleNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const visible = data.params?.visible ?? true
  return (
    <BaseNode  nodeType="set_visible" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(visible)}</div>
    </BaseNode>
  )
})

export const InstantModeNode = memo(function InstantModeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const enabled = data.params?.enabled ?? true
  return (
    <BaseNode  nodeType="instant_mode" selected={selected}>
      <div className="customNodeParam">{String(enabled)}</div>
    </BaseNode>
  )
})

export const MarkNodeNode = memo(function MarkNodeNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const name = data.params?.name ?? ''
  return (
    <BaseNode  nodeType="mark_node" selected={selected}>
      <div className="customNodeParam">{String(name)}</div>
    </BaseNode>
  )
})

export const CameraTrackUntilStopNode = memo(function CameraTrackUntilStopNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const ox = data.params?.offset_x ?? 0
  const oy = data.params?.offset_y ?? 0
  return (
    <BaseNode  nodeType="camera_track_until_stop" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">ox:{String(ox)} oy:{String(oy)}</div>
    </BaseNode>
  )
})

export const CameraCenterNode = memo(function CameraCenterNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const x = data.params?.x ?? 0
  const y = data.params?.y ?? 0
  return (
    <BaseNode  nodeType="camera_center" selected={selected}>
      <div className="customNodeParam">({String(x)}, {String(y)})</div>
    </BaseNode>
  )
})

export const CameraPanObjNode = memo(function CameraPanObjNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const seconds = data.params?.seconds ?? 1
  return (
    <BaseNode  nodeType="camera_pan_obj" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      <div className="customNodeParam">{String(seconds)}s</div>
    </BaseNode>
  )
})

export const TweenCameraNode = memo(function TweenCameraNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const property = data.params?.prop ?? data.params?.property ?? ''
  const to_value = data.params?.to_value ?? 0
  const seconds = data.params?.seconds ?? 1
  const easing = data.params?.easing ?? 'linear'
  return (
    <BaseNode  nodeType="tween_camera" selected={selected}>
      <div className="customNodeParam">camera.{String(property)} → {String(to_value)}</div>
      <div className="customNodeParam">{String(seconds)}s {String(easing)}</div>
    </BaseNode>
  )
})

// Partial Control — переключает уровень контроля игрока во время катсцены.
export const PartialControlNode = memo(function PartialControlNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const control_type = data.params?.control_type ?? data.params?.type ?? 0
  const whitelist = Array.isArray(data.params?.whitelist) ? data.params.whitelist : []
  return (
    <BaseNode  nodeType="partial_control" selected={selected}>
      <div className="customNodeParam">type: {String(control_type)}</div>
      {control_type === 1 && <div className="customNodeParam">whitelist: {whitelist.length} items</div>}
    </BaseNode>
  )
})

// Wait for Interact — ждёт взаимодействия игрока с объектом.
export const WaitInteractNode = memo(function WaitInteractNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  const timeout = data.params?.timeout ?? 0
  const timeoutAction = data.params?.timeout_action ?? 'continue'
  return (
    <BaseNode  nodeType="wait_for_interact" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      {Number(timeout) > 0 && <div className="customNodeParam">timeout: {String(timeout)}s</div>}
      {timeoutAction !== 'continue' && <div className="customNodeParam">on timeout: {String(timeoutAction)}</div>}
    </BaseNode>
  )
})

// Wait Until — ждёт, пока global-переменная не станет равна указанному значению.
export const WaitUntilNode = memo(function WaitUntilNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const conditionVar = data.params?.condition_var ?? ''
  const conditionEquals = data.params?.condition_equals ?? ''
  const timeout = data.params?.timeout_seconds ?? 0
  return (
    <BaseNode nodeType="wait_until" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">Wait</span>
        <span className="customNodeParamValue">{String(conditionVar)} = {String(conditionEquals)}</span>
      </div>
      {Number(timeout) > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">Timeout</span>
          <span className="customNodeParamValue">{String(timeout)}s</span>
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
    <BaseNode  nodeType="set_flag" selected={selected}>
      <div className="customNodeParam">{String(key)} = {String(value)}</div>
    </BaseNode>
  )
})

// Spawn Entity — создаёт объект в runtime.
export const SpawnEntityNode = memo(function SpawnEntityNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const obj = data.params?.object ?? ''
  const x = data.params?.x ?? 0
  const y = data.params?.y ?? 0
  const persistent = data.params?.persistent ?? false
  return (
    <BaseNode  nodeType="spawn_entity" selected={selected}>
      <div className="customNodeParam">{String(obj)}</div>
      <div className="customNodeParam">({String(x)}, {String(y)})</div>
      {persistent && <div className="customNodeParam">persistent</div>}
    </BaseNode>
  )
})

// Destroy Entity — уничтожает объект.
export const DestroyEntityNode = memo(function DestroyEntityNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode  nodeType="destroy_entity" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

// Set Plot — устанавливает глобальную переменную сюжета.
export const SetPlotNode = memo(function SetPlotNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const value = data.params?.value ?? 0
  return (
    <BaseNode  nodeType="set_plot" selected={selected}>
      <div className="customNodeParam">plot = {String(value)}</div>
    </BaseNode>
  )
})

// Director Note — редактор-only заметка режиссёра. Не экспортируется в JSON.
export const DirectorNoteNode = memo(function DirectorNoteNode({ data, selected }: CutsceneNodeProps): React.JSX.Element {
  const noteText = String(data.params?.note_text ?? '')
  const category = String(data.params?.category ?? 'todo')
  const pinned = Boolean(data.params?.pinned)
  const displayText = noteText.length > 40 ? noteText.slice(0, 40) + '…' : noteText
  return (
    <BaseNode nodeType="director_note" label={displayText || undefined} hasInput={false} hasOutput={false} selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{category}</span>
        {pinned && <span className="customNodeParamValue"> (pinned)</span>}
      </div>
    </BaseNode>
  )
})
