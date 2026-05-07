/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Типы полей ввода в инспекторе.
export type FieldType = 
  | 'text'           // Обычный текстовый input
  | 'number'         // Числовой input
  | 'select'         // Выпадающий список (option)
  | 'searchable'     // SearchableSelect с поиском
  | 'checkbox'       // Чекбокс
  | 'json'           // Текстовый input для JSON

// Описание одного поля в инспекторе ноды.
export interface NodeField {
  key: string
  label: string
  type: FieldType
  defaultValue?: unknown
  placeholder?: string
  options?: string[] | ((params: Record<string, unknown>) => string[])
  step?: number
  condition?: (params: Record<string, unknown>) => boolean
  style?: React.CSSProperties
}

// Полное определение типа ноды.
export interface NodeDefinition {
  type: string
  label: string
  category: string
  fields: NodeField[]
  defaultParams: Record<string, unknown>
}

// Хелперы для conditional логики.
export function whenParamEquals(paramKey: string, value: unknown): (params: Record<string, unknown>) => boolean {
  return (params) => params[paramKey] === value
}

export function whenParamNotEquals(paramKey: string, value: unknown): (params: Record<string, unknown>) => boolean {
  return (params) => params[paramKey] !== value
}

// Базовые ноды без полей.
const baseNodes: Record<string, NodeDefinition> = {
  start: { type: 'start', label: 'Start', category: 'flow', fields: [], defaultParams: {} },
  end: { type: 'end', label: 'End', category: 'flow', fields: [], defaultParams: {} },
  wait: { type: 'wait', label: 'Wait', category: 'flow', fields: [{ key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 }], defaultParams: { seconds: 1 } },
  move: { type: 'move', label: 'Move', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 },
    { key: 'speed_px_sec', label: 'Speed (px/sec)', type: 'number', placeholder: '60', defaultValue: 60 },
    { key: 'collision', label: 'Collision', type: 'select', options: ['false', 'true'], defaultValue: false }
  ], defaultParams: { target: 'player', x: 0, y: 0, speed_px_sec: 60, collision: false } },
  set_position: { type: 'set_position', label: 'Set Position', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 }
  ], defaultParams: { target: 'player', x: 0, y: 0 } },
  actor_create: { type: 'actor_create', label: 'Actor Create', category: 'actor', fields: [
    { key: 'key', label: 'Key', type: 'searchable', placeholder: 'npc_guide', options: [] },
    { key: 'sprite_or_object', label: 'Sprite / Object', type: 'searchable', placeholder: 'obj_actor / spr_...', options: [] },
    { key: 'copy_from', label: 'Copy From', type: 'searchable', placeholder: 'player / actor key (optional)', options: [] },
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 }
  ], defaultParams: { key: '', sprite_or_object: '', copy_from: '', x: 0, y: 0 } },
  actor_destroy: { type: 'actor_destroy', label: 'Actor Destroy', category: 'actor', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key', options: [] }
  ], defaultParams: { target: 'player' } },
  animate: { type: 'animate', label: 'Animate', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'sprite', label: 'Sprite', type: 'searchable', placeholder: 'spr_...', options: [] },
    { key: 'image_index', label: 'Image Index', type: 'number', placeholder: '0', defaultValue: 0 },
    { key: 'image_speed', label: 'Image Speed', type: 'number', step: 0.1, placeholder: '1', defaultValue: 1 }
  ], defaultParams: { target: 'player', sprite: '', image_index: 0, image_speed: 1 } },
  dialogue: { type: 'dialogue', label: 'Dialogue', category: 'dialogue', fields: [
    { key: 'file', label: 'File', type: 'searchable', placeholder: 'dialogue', options: [] },
    { key: 'node', label: 'Node', type: 'searchable', placeholder: 'Intro', options: [] }
  ], defaultParams: { file: '', node: '' } },
  wait_for_dialogue: { type: 'wait_for_dialogue', label: 'Wait For Dialogue', category: 'dialogue', fields: [
    { key: 'dialogue_controller', label: 'Dialogue Controller (optional)', type: 'text', placeholder: 'instance ref / leave empty for active textbox', defaultValue: '' }
  ], defaultParams: { dialogue_controller: '' } }
}

// Camera ноды.
const cameraNodes: Record<string, NodeDefinition> = {
  camera_track: { type: 'camera_track', label: 'Camera Track', category: 'camera', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, placeholder: '2', defaultValue: 1 },
    { key: 'offset_x', label: 'Offset X', type: 'number', defaultValue: 0 },
    { key: 'offset_y', label: 'Offset Y', type: 'number', defaultValue: 0 }
  ], defaultParams: { target: 'player', seconds: 1, offset_x: 0, offset_y: 0 } },
  camera_track_until_stop: { type: 'camera_track_until_stop', label: 'Camera Track Until Stop', category: 'camera', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'offset_x', label: 'Offset X', type: 'number', defaultValue: 0 },
    { key: 'offset_y', label: 'Offset Y', type: 'number', defaultValue: 0 }
  ], defaultParams: { target: 'player', offset_x: 0, offset_y: 0 } },
  camera_pan: { type: 'camera_pan', label: 'Camera Pan', category: 'camera', fields: [
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, placeholder: '1', defaultValue: 1 }
  ], defaultParams: { x: 0, y: 0, seconds: 1 } },
  camera_pan_obj: { type: 'camera_pan_obj', label: 'Camera Pan To Object', category: 'camera', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, placeholder: '1', defaultValue: 1 }
  ], defaultParams: { target: 'player', seconds: 1 } },
  camera_center: { type: 'camera_center', label: 'Camera Center', category: 'camera', fields: [
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 }
  ], defaultParams: { x: 0, y: 0 } },
  camera_shake: { type: 'camera_shake', label: 'Camera Shake', category: 'camera', fields: [
    { key: 'seconds', label: 'Duration (seconds)', type: 'number', step: 0.1, placeholder: '1', defaultValue: 1 },
    { key: 'magnitude', label: 'Magnitude (px)', type: 'number', placeholder: '4', defaultValue: 4 }
  ], defaultParams: { seconds: 1, magnitude: 4 } }
}

// Conditional ноды (tween, set_property).
const conditionalNodes: Record<string, NodeDefinition> = {
  tween: { type: 'tween', label: 'Tween', category: 'camera', fields: [
    { key: 'kind', label: 'Kind', type: 'select', options: ['instance', 'camera'], defaultValue: 'instance' },
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [], condition: whenParamNotEquals('kind', 'camera') },
    { key: 'property', label: 'Property', type: 'text', defaultValue: '' },
    { key: 'to', label: 'To', type: 'number', defaultValue: 0 },
    { key: 'from', label: 'From (optional)', type: 'number', defaultValue: '' },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'easing', label: 'Easing', type: 'select', options: ['linear', 'ease_in', 'ease_out', 'ease_in_out'], defaultValue: 'linear' }
  ], defaultParams: { kind: 'instance', target: 'player', property: 'x', to: 0, seconds: 1, easing: 'linear' } },
  set_property: { type: 'set_property', label: 'Set Property', category: 'camera', fields: [
    { key: 'kind', label: 'Kind', type: 'select', options: ['instance', 'camera'], defaultValue: 'instance' },
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [], condition: whenParamNotEquals('kind', 'camera') },
    { key: 'property', label: 'Property', type: 'text', defaultValue: '' },
    { key: 'value', label: 'Value', type: 'text', defaultValue: '' }
  ], defaultParams: { kind: 'instance', target: 'player', property: 'image_alpha', value: 1 } }
}

// Остальные ноды.
const otherNodes: Record<string, NodeDefinition> = {
  set_depth: { type: 'set_depth', label: 'Set Depth', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'depth', label: 'Depth', type: 'number', placeholder: '0', defaultValue: 0 }
  ], defaultParams: { target: 'player', depth: 0 } },
  set_facing: { type: 'set_facing', label: 'Set Facing', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'direction', label: 'Direction', type: 'select', options: ['left', 'right', 'up', 'down'], defaultValue: 'right' }
  ], defaultParams: { target: 'player', direction: 'right' } },
  auto_facing: { type: 'auto_facing', label: 'Auto Facing', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'enabled', label: 'Enabled', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target: 'player', enabled: true } },
  auto_walk: { type: 'auto_walk', label: 'Auto Walk', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'enabled', label: 'Enabled', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target: 'player', enabled: true } },
  fade_in: { type: 'fade_in', label: 'Fade In', category: 'camera', fields: [
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'color', label: 'Color', type: 'text', defaultValue: 'black' }
  ], defaultParams: { seconds: 0.5, color: 'black' } },
  fade_out: { type: 'fade_out', label: 'Fade Out', category: 'camera', fields: [
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'color', label: 'Color', type: 'text', defaultValue: 'black' }
  ], defaultParams: { seconds: 0.5, color: 'black' } },
  play_sfx: { type: 'play_sfx', label: 'Play SFX', category: 'audio', fields: [
    { key: 'sound', label: 'Sound / Key', type: 'text', defaultValue: '' },
    { key: 'volume', label: 'Volume', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'pitch', label: 'Pitch', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { sound: '', volume: 1, pitch: 1 } },
  emote: { type: 'emote', label: 'Emote', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'sprite', label: 'Sprite', type: 'searchable', placeholder: 'spr_...', options: [] },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'offset_x', label: 'Offset X', type: 'number', defaultValue: 0 },
    { key: 'offset_y', label: 'Offset Y', type: 'number', defaultValue: -24 },
    { key: 'scale', label: 'Scale', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'wait', label: 'Wait', type: 'select', options: ['false (fire and forget)', 'true (wait for finish)'], defaultValue: false }
  ], defaultParams: { target: 'player', sprite: '', seconds: 1, offset_x: 0, offset_y: -24, scale: 1, wait: false } },
  jump: { type: 'jump', label: 'Jump', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'height', label: 'Height', type: 'number', defaultValue: 16 },
    { key: 'easing', label: 'Easing', type: 'select', options: ['linear', 'ease_in', 'ease_out', 'ease_in_out'], defaultValue: 'linear' }
  ], defaultParams: { target: 'player', x: 0, y: 0, seconds: 0.5, height: 16, easing: 'linear' } },
  halt: { type: 'halt', label: 'Halt', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] }
  ], defaultParams: { target: 'player' } },
  flip: { type: 'flip', label: 'Flip', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'flipped', label: 'Flipped', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target: 'player', flipped: true } },
  spin: { type: 'spin', label: 'Spin', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'speed', label: 'Speed', type: 'number', defaultValue: 10 },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { target: 'player', speed: 10, seconds: 1 } },
  shake_object: { type: 'shake_object', label: 'Shake Object', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'magnitude', label: 'Magnitude', type: 'number', defaultValue: 4 }
  ], defaultParams: { target: 'player', seconds: 0.5, magnitude: 4 } },
  set_visible: { type: 'set_visible', label: 'Set Visible', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'visible', label: 'Visible', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target: 'player', visible: true } },
  instant_mode: { type: 'instant_mode', label: 'Instant Mode', category: 'logic', fields: [
    { key: 'enabled', label: 'Enabled', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { enabled: true } },
  mark_node: { type: 'mark_node', label: 'Mark Node', category: 'logic', fields: [
    { key: 'name', label: 'Mark Name', type: 'text', placeholder: 'point_a', defaultValue: '' }
  ], defaultParams: { name: '' } },
  branch: { type: 'branch', label: 'Branch', category: 'logic', fields: [
    { key: 'condition', label: 'Condition', type: 'searchable', placeholder: 'e.g. has_item_key', options: [] }
  ], defaultParams: { condition: '' } },
  run_function: { type: 'run_function', label: 'Run Function', category: 'logic', fields: [
    { key: 'function', label: 'Function Name', type: 'searchable', placeholder: 'my_cutscene_func', options: [] },
    { key: 'args', label: 'Args (JSON)', type: 'json', placeholder: '["arg1", 42]', defaultValue: '' }
  ], defaultParams: { function: '', args: '' } },
  partial_control: { type: 'partial_control', label: 'Partial Control', category: 'logic', fields: [
    { key: 'control_type', label: 'Control Type', type: 'select', options: ['0', '1', '2'], defaultValue: 0 },
    { key: 'whitelist', label: 'Whitelist (JSON array)', type: 'json', placeholder: '["obj_door", "obj_chest"]', defaultValue: '' }
  ], defaultParams: { control_type: 0, whitelist: '' } },
  wait_for_interact: { type: 'wait_for_interact', label: 'Wait Interact', category: 'logic', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / object', options: [] },
    { key: 'timeout', label: 'Timeout (seconds, 0=never)', type: 'number', step: 0.1, defaultValue: 0 }
  ], defaultParams: { target: 'player', timeout: 0 } },
  set_flag: { type: 'set_flag', label: 'Set Flag', category: 'logic', fields: [
    { key: 'key', label: 'Flag Key', type: 'text', placeholder: 'story_progress', defaultValue: '' },
    { key: 'value', label: 'Value', type: 'text', placeholder: '1', defaultValue: '' }
  ], defaultParams: { key: '', value: '' } },
  spawn_entity: { type: 'spawn_entity', label: 'Spawn Entity', category: 'logic', fields: [
    { key: 'object', label: 'Object', type: 'searchable', placeholder: 'obj_...', options: [] },
    { key: 'key', label: 'Key (optional)', type: 'text', placeholder: 'temp_actor', defaultValue: '' },
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 },
    { key: 'depth', label: 'Depth', type: 'number', placeholder: '0', defaultValue: 0 },
    { key: 'persistent', label: 'Persistent', type: 'checkbox', defaultValue: false }
  ], defaultParams: { object: '', x: 0, y: 0, key: '', depth: 0, persistent: false } },
  destroy_entity: { type: 'destroy_entity', label: 'Destroy Entity', category: 'logic', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key', options: [] }
  ], defaultParams: { target: '' } },
  set_plot: { type: 'set_plot', label: 'Set Plot', category: 'logic', fields: [
    { key: 'value', label: 'Plot Value', type: 'number', placeholder: '10', defaultValue: 0 }
  ], defaultParams: { value: 0 } },
  // TODO: follow_path needs special handling for points array
  follow_path: { type: 'follow_path', label: 'Follow Path', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'speed_px_sec', label: 'Speed (px/sec)', type: 'number', placeholder: '60', defaultValue: 60 },
    { key: 'collision', label: 'Collision', type: 'select', options: ['false', 'true'], defaultValue: false }
  ], defaultParams: { target: 'player', points: [], speed_px_sec: 60, collision: false } },
  // TODO: tween_camera - legacy node, may need special handling
  tween_camera: { type: 'tween_camera', label: 'Tween Camera', category: 'camera', fields: [
    { key: 'property', label: 'Property', type: 'text', defaultValue: '' },
    { key: 'to_value', label: 'To Value', type: 'number', defaultValue: 0 },
    { key: 'from_value', label: 'From Value (optional)', type: 'number', defaultValue: undefined },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'easing', label: 'Easing', type: 'select', options: ['linear', 'ease_in', 'ease_out', 'ease_in_out'], defaultValue: 'linear' }
  ], defaultParams: { property: 'x', to_value: 0, seconds: 1, easing: 'linear', from_value: undefined } },
  // TODO: parallel_start, parallel_join - need special handling for branches
  parallel_start: { type: 'parallel_start', label: 'Parallel', category: 'logic', fields: [], defaultParams: { branches: ['b0'] } },
  parallel_join: { type: 'parallel_join', label: 'Parallel Join', category: 'logic', fields: [], defaultParams: { branches: ['b0'] } }
}

export const NODE_REGISTRY: Record<string, NodeDefinition> = {
  ...baseNodes,
  ...cameraNodes,
  ...conditionalNodes,
  ...otherNodes
}
