import React, { memo, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Handle, Position } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import { usePreferencesContext } from '../PreferencesContext'
import { useNodeActionsRef } from '../NodeActionsContext'
import { createTranslator } from '../../i18n'
import type { CutsceneNodeProps } from './CutsceneNodeTypes'
import { renderParallelHandles, renderSharedParallelHandle } from './CutsceneNodeTypes'

// --- Logic & Control ---

// Fork-нода: много выходов.
export const ParallelStartNode = memo(function ParallelStartNode(
  props: CutsceneNodeProps & { id?: string }
): React.JSX.Element {
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
  const baseNodeStyle = useMemo(() => ({ minHeight: parallelMinHeight }), [parallelMinHeight])
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
    <BaseNode
      nodeType="parallel_start"
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
export const ParallelJoinNode = memo(function ParallelJoinNode(
  props: CutsceneNodeProps & { id?: string }
): React.JSX.Element {
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
  const baseNodeStyle = useMemo(() => ({ minHeight: parallelMinHeight }), [parallelMinHeight])
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
    <BaseNode
      nodeType="parallel_join"
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
export const BranchNode = memo(function BranchNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const condition = data.params?.condition ?? ''

  const trueLabelStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      right: 18,
      top: '25%',
      transform: 'translateY(-50%)',
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--status-success)',
      letterSpacing: '0.04em',
      pointerEvents: 'none',
      userSelect: 'none'
    }),
    []
  )

  const falseLabelStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      right: 18,
      top: '75%',
      transform: 'translateY(-50%)',
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--status-error)',
      letterSpacing: '0.04em',
      pointerEvents: 'none',
      userSelect: 'none'
    }),
    []
  )
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
          <span style={trueLabelStyle}>{t('editor.true', 'TRUE')}</span>

          {/* Выход "false" — нижняя правая точка */}
          <Handle
            type="source"
            position={Position.Right}
            id="out_false"
            className="customHandle customHandleFalse"
            style={{ top: '75%' }}
          />
          <span style={falseLabelStyle}>{t('editor.false', 'FALSE')}</span>
        </>
      }
    >
      {condition && <div className="customNodeParam">{String(condition)}</div>}
    </BaseNode>
  )
})

// Запуск функции/скрипта.
export const RunFunctionNode = memo(function RunFunctionNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const funcName = data.params?.function ?? ''
  return (
    <BaseNode nodeType="run_function" selected={selected}>
      {funcName && <div className="customNodeParam">{String(funcName)}()</div>}
    </BaseNode>
  )
})

// Анимация параметров инстанса или камеры.
export const TweenNode = memo(function TweenNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const kind = data.params?.kind ?? 'instance'
  const target = data.params?.target ?? 'camera'
  const property = data.params?.prop ?? ''
  const to = data.params?.end_value ?? '?'
  return (
    <BaseNode nodeType="tween" selected={selected}>
      <div className="customNodeParam">{String(kind) === 'camera' ? 'camera' : String(target)}</div>
      <div className="customNodeParam">
        {String(property)} → {String(to)}
      </div>
    </BaseNode>
  )
})

// Установка значения свойства инстанса или камеры.
export const SetPropertyNode = memo(function SetPropertyNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const kind = data.params?.kind ?? 'instance'
  const target = data.params?.target ?? 'camera'
  const property = data.params?.property ?? ''
  const value = data.params?.value ?? '?'
  return (
    <BaseNode nodeType="set_property" selected={selected}>
      <div className="customNodeParam">{String(kind) === 'camera' ? 'camera' : String(target)}</div>
      <div className="customNodeParam">
        {String(property)} = {String(value)}
      </div>
    </BaseNode>
  )
})

// Отметка позиции в сценарии.
export const MarkNodeNode = memo(function MarkNodeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const name = data.params?.name ?? ''
  return (
    <BaseNode nodeType="mark_node" selected={selected}>
      <div className="customNodeParam">{String(name)}</div>
    </BaseNode>
  )
})

// Управление уровнем контроля игрока во время катсцены.
export const PartialControlNode = memo(function PartialControlNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const control_type = data.params?.control_type ?? 0
  const whitelist = Array.isArray(data.params?.whitelist) ? data.params.whitelist : []
  return (
    <BaseNode nodeType="partial_control" selected={selected}>
      <div className="customNodeParam">
        {t('nodes.fields.control_type', 'type')}: {String(control_type)}
      </div>
      {control_type === 1 && (
        <div className="customNodeParam">
          {t('nodes.fields.whitelist', 'whitelist')}: {whitelist.length}{' '}
          {t('nodes.preview.items', 'items')}
        </div>
      )}
    </BaseNode>
  )
})

// Ожидание взаимодействия игрока.
export const WaitInteractNode = memo(function WaitInteractNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const timeout = data.params?.timeout ?? 0
  const timeoutAction = data.params?.timeout_action ?? 'continue'
  return (
    <BaseNode nodeType="wait_for_interact" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
      {Number(timeout) > 0 && (
        <div className="customNodeParam">
          {t('nodes.fields.timeout', 'timeout')}: {String(timeout)}
          {t('nodes.preview.secondsSuffix', 's')}
        </div>
      )}
      {timeoutAction !== 'continue' && (
        <div className="customNodeParam">
          {t('nodes.preview.onTimeout', 'on timeout')}: {String(timeoutAction)}
        </div>
      )}
    </BaseNode>
  )
})

// Ожидание выполнения условия глобальной переменной.
export const WaitUntilNode = memo(function WaitUntilNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const conditionVar = data.params?.condition_var ?? ''
  const conditionEquals = data.params?.condition_equals ?? ''
  const timeout = data.params?.timeout_seconds ?? 0
  return (
    <BaseNode nodeType="wait_until" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.wait', 'Wait')}</span>
        <span className="customNodeParamValue">
          {String(conditionVar)} = {String(conditionEquals)}
        </span>
      </div>
      {Number(timeout) > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.fields.timeout_seconds', 'Timeout')}</span>
          <span className="customNodeParamValue">
            {String(timeout)}
            {t('nodes.preview.secondsSuffix', 's')}
          </span>
        </div>
      )}
    </BaseNode>
  )
})

// Установка флага.
export const SetFlagNode = memo(function SetFlagNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const key = data.params?.key ?? ''
  const value = data.params?.value ?? 0
  return (
    <BaseNode nodeType="set_flag" selected={selected}>
      <div className="customNodeParam">
        {String(key)} = {String(value)}
      </div>
    </BaseNode>
  )
})

// Создание сущности.
export const SpawnEntityNode = memo(function SpawnEntityNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const obj = data.params?.object ?? ''
  const x = data.params?.x ?? 0
  const y = data.params?.y ?? 0
  const persistent = data.params?.persistent ?? false
  return (
    <BaseNode nodeType="spawn_entity" selected={selected}>
      <div className="customNodeParam">{String(obj)}</div>
      <div className="customNodeParam">
        ({String(x)}, {String(y)})
      </div>
      {persistent && (
        <div className="customNodeParam">{t('nodes.fields.persistent', 'persistent')}</div>
      )}
    </BaseNode>
  )
})

// Уничтожение сущности.
export const DestroyEntityNode = memo(function DestroyEntityNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const target = data.params?.target ?? ''
  return (
    <BaseNode nodeType="destroy_entity" selected={selected}>
      <div className="customNodeParam">{String(target)}</div>
    </BaseNode>
  )
})

// Установка уровня сюжета (plot).
export const SetPlotNode = memo(function SetPlotNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const value = data.params?.value ?? 0
  return (
    <BaseNode nodeType="set_plot" selected={selected}>
      <div className="customNodeParam">plot = {String(value)}</div>
    </BaseNode>
  )
})

// Планирование действия с задержкой.
export const ScheduleActionNode = memo(function ScheduleActionNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
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
        <span className="customNodeParamValue">
          {String(delay)}
          {t('nodes.preview.secondsSuffix', 's')}
        </span>
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

// Привязка к объекту-родителю.
export const AttachToTargetNode = memo(function AttachToTargetNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const parent = data.params?.parent_ref ?? ''
  const offsetX = data.params?.offset_x ?? 0
  const offsetY = data.params?.offset_y ?? 0
  const duration = data.params?.duration_seconds ?? 0
  return (
    <BaseNode nodeType="attach_to_target" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.parent_ref', 'Parent')}</span>
        <span className="customNodeParamValue">{String(parent)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.preview.offset', 'Offset')}</span>
        <span className="customNodeParamValue">
          {String(offsetX)}, {String(offsetY)}
        </span>
      </div>
      {Number(duration) > 0 && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">
            {t('nodes.fields.duration_seconds', 'Duration')}
          </span>
          <span className="customNodeParamValue">
            {String(duration)}
            {t('nodes.preview.secondsSuffix', 's')}
          </span>
        </div>
      )}
    </BaseNode>
  )
})

// Отвязка от объекта-родителя.
export const DetachNode = memo(function DetachNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const target = data.params?.target ?? ''
  const destroy = data.params?.destroy_after_detach ?? false
  return (
    <BaseNode nodeType="detach" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.target', 'Target')}</span>
        <span className="customNodeParamValue">{String(target)}</span>
      </div>
      {destroy && <div className="customNodeParam">{t('nodes.preview.destroy', 'destroy')}</div>}
    </BaseNode>
  )
})

// Создание чекпоинта состояния.
export const CheckpointStateNode = memo(function CheckpointStateNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const id = data.params?.checkpoint_id ?? ''
  const includeActors = data.params?.include_actors === true
  const includePlayer = data.params?.include_player === true
  const includeCamera = data.params?.include_camera === true
  const includeMusic = data.params?.include_music === true
  const globals =
    typeof data.params?.include_globals === 'string' ? data.params.include_globals.trim() : ''
  const instances =
    typeof data.params?.include_instances === 'string' ? data.params.include_instances.trim() : ''
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

// Восстановление состояния из чекпоинта.
export const RestoreStateNode = memo(function RestoreStateNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
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

// Смена комнаты.
export const RoomChangeNode = memo(function RoomChangeNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const room = data.params?.room ?? ''
  const px = data.params?.player_x ?? 0
  const py = data.params?.player_y ?? 0
  const actors = typeof data.params?.actors === 'string' ? data.params.actors.trim() : ''
  return (
    <BaseNode nodeType="room_change" selected={selected}>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.room', 'Room')}</span>
        <span className="customNodeParamValue">{String(room)}</span>
      </div>
      <div className="customNodeParam">
        <span className="customNodeParamKey">{t('nodes.fields.player', 'Player')}</span>
        <span className="customNodeParamValue">{String(px)}, {String(py)}</span>
      </div>
      {actors && (
        <div className="customNodeParam">
          <span className="customNodeParamKey">{t('nodes.fields.actors', 'Actors')}</span>
          <span className="customNodeParamValue">{actors}</span>
        </div>
      )}
    </BaseNode>
  )
})
