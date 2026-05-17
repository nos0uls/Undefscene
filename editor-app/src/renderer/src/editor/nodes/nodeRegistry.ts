/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Цвета категорий нод — используют CSS-переменные из системы токенов.
// Каждая категория имеет свой цвет для визуального различения на canvas.
export const NODE_COLORS: Record<string, string> = {
  flow: 'var(--node-start)', // start, end, wait — синий
  movement: 'var(--node-animate)', // move, follow_path, set_position — фиолетовый
  actor: 'var(--node-animate)', // actor_create, actor_destroy — фиолетовый
  visual: 'var(--node-animate)', // animate, set_facing, set_depth, auto_facing, auto_walk, flip, visible
  dialogue: 'var(--node-dialogue)', // dialogue — розовый
  camera: 'var(--node-camera)', // camera_track, camera_pan, camera_shake, tween(camera) — зелёный
  logic: 'var(--node-logic)', // parallel, branch, run_function, instant_mode — оранжевый
  audio: 'var(--node-audio)', // play_sfx — бирюзовый
  wait: 'var(--node-wait)' // wait-related — серо-синий
}

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
    { key: 'actor_name', label: 'Key', type: 'searchable', placeholder: 'npc_guide', options: [] },
    { key: 'actor_sprite', label: 'Sprite / Object', type: 'searchable', placeholder: 'obj_actor / spr_...', options: [] },
    { key: 'copy_target', label: 'Copy From', type: 'searchable', placeholder: 'player / actor key (optional)', options: [] },
    { key: 'x', label: 'X', type: 'number', defaultValue: 0 },
    { key: 'y', label: 'Y', type: 'number', defaultValue: 0 }
  ], defaultParams: { actor_name: '', actor_sprite: '', copy_target: '', x: 0, y: 0 } },
  actor_destroy: { type: 'actor_destroy', label: 'Actor Destroy', category: 'actor', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key', options: [] }
  ], defaultParams: { target: 'player' } },
  attach_to_target: { type: 'attach_to_target', label: 'Attach To Target', category: 'actor', fields: [
    { key: 'target_ref', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'parent_ref', label: 'Parent', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'offset_x', label: 'Offset X', type: 'number', defaultValue: 0 },
    { key: 'offset_y', label: 'Offset Y', type: 'number', defaultValue: 0 },
    { key: 'follow_facing', label: 'Follow Facing', type: 'select', options: ['true', 'false'], defaultValue: true },
    { key: 'follow_scale', label: 'Follow Scale', type: 'select', options: ['true', 'false'], defaultValue: true },
    { key: 'follow_depth', label: 'Follow Depth', type: 'select', options: ['true', 'false'], defaultValue: true },
    { key: 'duration_seconds', label: 'Duration (seconds, 0=instant)', type: 'number', step: 0.1, defaultValue: 0 },
    { key: 'detach_on_cutscene_end', label: 'Detach On Cutscene End', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target_ref: 'player', parent_ref: '', offset_x: 0, offset_y: 0, follow_facing: true, follow_scale: true, follow_depth: true, duration_seconds: 0, detach_on_cutscene_end: true } },
  detach: { type: 'detach', label: 'Detach', category: 'actor', fields: [
    { key: 'target_ref', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'keep_world_position', label: 'Keep World Position', type: 'select', options: ['true', 'false'], defaultValue: true },
    { key: 'destroy_after_detach', label: 'Destroy After Detach', type: 'select', options: ['true', 'false'], defaultValue: false }
  ], defaultParams: { target_ref: 'player', keep_world_position: true, destroy_after_detach: false } },
  animate: { type: 'animate', label: 'Animate', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'sprite', label: 'Sprite', type: 'searchable', placeholder: 'spr_...', options: [] },
    { key: 'image_index', label: 'Image Index', type: 'number', placeholder: '0', defaultValue: 0 },
    { key: 'image_speed', label: 'Image Speed', type: 'number', step: 0.1, placeholder: '1', defaultValue: 1 }
  ], defaultParams: { target: 'player', sprite: '', image_index: 0, image_speed: 1 } },
  set_animation_frame: { type: 'set_animation_frame', label: 'Set Animation Frame', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'image_index', label: 'Image Index', type: 'number', placeholder: 'frame number', defaultValue: 0 },
    { key: 'image_speed', label: 'Image Speed', type: 'number', step: 0.1, placeholder: '1 = normal', defaultValue: 1 },
    { key: 'pause', label: 'Pause', type: 'select', options: ['true', 'false'], defaultValue: false }
  ], defaultParams: { target: 'player', image_index: 0, image_speed: 1, pause: false } },
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
    { key: 'magnitude', label: 'Magnitude (px)', type: 'number', placeholder: '4', defaultValue: 4 },
    { key: 'magnitude_x', label: 'Magnitude X (px)', type: 'number', placeholder: '4', defaultValue: 4 },
    { key: 'magnitude_y', label: 'Magnitude Y (px)', type: 'number', placeholder: '4', defaultValue: 4 },
    { key: 'decay', label: 'Decay', type: 'select', options: ['true', 'false'], defaultValue: false },
    { key: 'frequency', label: 'Frequency', type: 'number', step: 1, placeholder: '1', defaultValue: 1 }
  ], defaultParams: { seconds: 1, magnitude: 4, magnitude_x: 4, magnitude_y: 4, decay: false, frequency: 1 } }
}

// Conditional ноды (tween, set_property).
const conditionalNodes: Record<string, NodeDefinition> = {
  tween: { type: 'tween', label: 'Tween', category: 'camera', fields: [
    { key: 'kind', label: 'Kind', type: 'select', options: ['instance', 'camera'], defaultValue: 'instance' },
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [], condition: whenParamNotEquals('kind', 'camera') },
    { key: 'prop', label: 'Property', type: 'searchable', placeholder: 'x, y, image_alpha...', options: ['x', 'y', 'image_alpha', 'image_angle', 'image_xscale', 'image_yscale', 'image_blend', 'image_speed', 'depth'], defaultValue: '' },
    { key: 'end_value', label: 'To', type: 'number', defaultValue: 0 },
    { key: 'start_value_override', label: 'From (optional)', type: 'number', defaultValue: '' },
    { key: 'duration_frames', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'ease_name', label: 'Easing', type: 'select', options: ['linear', 'ease_in', 'ease_out', 'ease_in_out'], defaultValue: 'linear' }
  ], defaultParams: { kind: 'instance', target: 'player', prop: 'x', end_value: 0, duration_frames: 1, ease_name: 'linear' } },
  set_property: { type: 'set_property', label: 'Set Property', category: 'camera', fields: [
    { key: 'kind', label: 'Kind', type: 'select', options: ['instance', 'camera'], defaultValue: 'instance' },
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [], condition: whenParamNotEquals('kind', 'camera') },
    { key: 'property', label: 'Property', type: 'searchable', placeholder: 'image_alpha...', options: ['x', 'y', 'image_alpha', 'image_angle', 'image_xscale', 'image_yscale', 'image_blend', 'image_speed', 'depth', 'visible'], defaultValue: '' },
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
    { key: 'sound', label: 'Sound / Key', type: 'searchable', placeholder: 'snd_...', options: [], defaultValue: '' },
    { key: 'volume', label: 'Volume', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'pitch', label: 'Pitch', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { sound: '', volume: 1, pitch: 1 } },
  play_music: { type: 'play_music', label: 'Play Music', category: 'audio', fields: [
    { key: 'sound', label: 'Track', type: 'searchable', placeholder: 'music_...', options: [], defaultValue: '' },
    { key: 'volume', label: 'Volume', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'fade', label: 'Fade In (sec)', type: 'number', step: 0.1, defaultValue: 0.5 }
  ], defaultParams: { sound: '', volume: 1, fade: 0.5 } },
  stop_music: { type: 'stop_music', label: 'Stop Music', category: 'audio', fields: [
    { key: 'fade', label: 'Fade Out (sec)', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { fade: 1 } },
  music_volume: { type: 'music_volume', label: 'Music Volume', category: 'audio', fields: [
    { key: 'volume', label: 'Volume', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'fade', label: 'Fade (sec)', type: 'number', step: 0.1, defaultValue: 0.5 }
  ], defaultParams: { volume: 1, fade: 0.5 } },
  music_duck: { type: 'music_duck', label: 'Music Duck', category: 'audio', fields: [
    { key: 'multiplier', label: 'Multiplier (0..1)', type: 'number', step: 0.1, defaultValue: 0.3 },
    { key: 'fade', label: 'Fade (sec)', type: 'number', step: 0.1, defaultValue: 0.3 }
  ], defaultParams: { multiplier: 0.3, fade: 0.3 } },
  music_unduck: { type: 'music_unduck', label: 'Music Unduck', category: 'audio', fields: [
    { key: 'fade', label: 'Fade (sec)', type: 'number', step: 0.1, defaultValue: 0.3 }
  ], defaultParams: { fade: 0.3 } },
  music_pitch: { type: 'music_pitch', label: 'Music Pitch', category: 'audio', fields: [
    { key: 'pitch', label: 'Pitch', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { pitch: 1 } },
  music_pause: { type: 'music_pause', label: 'Music Pause', category: 'audio', fields: [], defaultParams: {} },
  music_resume: { type: 'music_resume', label: 'Music Resume', category: 'audio', fields: [], defaultParams: {} },
  play_boss_music: { type: 'play_boss_music', label: 'Play Boss Music', category: 'audio', fields: [
    { key: 'calm', label: 'Calm Track', type: 'searchable', placeholder: 'music_calm...', options: [], defaultValue: '' },
    { key: 'battle', label: 'Battle Track', type: 'searchable', placeholder: 'music_battle...', options: [], defaultValue: '' },
    { key: 'fade', label: 'Fade In (sec)', type: 'number', step: 0.1, defaultValue: 0.5 }
  ], defaultParams: { calm: '', battle: '', fade: 0.5 } },
  stop_boss_music: { type: 'stop_boss_music', label: 'Stop Boss Music', category: 'audio', fields: [
    { key: 'fade', label: 'Fade Out (sec)', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { fade: 1 } },
  boss_music_phase: { type: 'boss_music_phase', label: 'Boss Music Phase', category: 'audio', fields: [
    { key: 'phases', label: 'Phases (JSON)', type: 'json', placeholder: '[{"intro":"snd_intro","calm":"snd_calm","battle":"snd_battle","intensity":0,"fade":0.5}]', defaultValue: '' },
    { key: 'fade', label: 'Default Fade (sec)', type: 'number', step: 0.1, defaultValue: 0.5 }
  ], defaultParams: { phases: '', fade: 0.5 } },
  play_music_intro: { type: 'play_music_intro', label: 'Play Music Intro', category: 'audio', fields: [
    { key: 'intro', label: 'Intro Track', type: 'searchable', placeholder: 'music_intro...', options: [], defaultValue: '' },
    { key: 'loop', label: 'Loop Track', type: 'searchable', placeholder: 'music_loop...', options: [], defaultValue: '' },
    { key: 'fade', label: 'Fade In (sec)', type: 'number', step: 0.1, defaultValue: 0.5 }
  ], defaultParams: { intro: '', loop: '', fade: 0.5 } },
  play_music_intro_layered: { type: 'play_music_intro_layered', label: 'Play Intro Layered', category: 'audio', fields: [
    { key: 'intro', label: 'Intro Track', type: 'searchable', placeholder: 'music_intro...', options: [], defaultValue: '' },
    { key: 'calm', label: 'Calm Track', type: 'searchable', placeholder: 'music_calm...', options: [], defaultValue: '' },
    { key: 'battle', label: 'Battle Track', type: 'searchable', placeholder: 'music_battle...', options: [], defaultValue: '' },
    { key: 'fade', label: 'Fade In (sec)', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'start_intensity', label: 'Start Intensity', type: 'number', step: 0.1, defaultValue: 0 }
  ], defaultParams: { intro: '', calm: '', battle: '', fade: 0.5, start_intensity: 0 } },
  crossfade_music: { type: 'crossfade_music', label: 'Crossfade Music', category: 'audio', fields: [
    { key: 'intensity', label: 'Intensity (0=calm, 1=battle)', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'fade', label: 'Fade (sec)', type: 'number', step: 0.1, defaultValue: 1 }
  ], defaultParams: { intensity: 0.5, fade: 1 } },
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
    { key: 'magnitude', label: 'Magnitude', type: 'number', defaultValue: 4 },
    { key: 'magnitude_x', label: 'Magnitude X', type: 'number', placeholder: '4', defaultValue: 4 },
    { key: 'magnitude_y', label: 'Magnitude Y', type: 'number', placeholder: '4', defaultValue: 4 },
    { key: 'decay', label: 'Decay', type: 'select', options: ['true', 'false'], defaultValue: false },
    { key: 'frequency', label: 'Frequency', type: 'number', step: 1, placeholder: '1', defaultValue: 1 }
  ], defaultParams: { target: 'player', seconds: 0.5, magnitude: 4, magnitude_x: 4, magnitude_y: 4, decay: false, frequency: 1 } },
  set_visible: { type: 'set_visible', label: 'Set Visible', category: 'visual', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'visible', label: 'Visible', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target: 'player', visible: true } },
  instant_mode: { type: 'instant_mode', label: 'Instant Mode', category: 'logic', fields: [
    { key: 'enabled', label: 'Enabled', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { enabled: true } },
  mark_node: { type: 'mark_node', label: 'Mark Node', category: 'logic', fields: [
    { key: 'name', label: 'Mark Name', type: 'searchable', placeholder: 'point_a', options: [], defaultValue: '' }
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
    { key: 'timeout', label: 'Timeout (seconds, 0=never)', type: 'number', step: 0.1, defaultValue: 0 },
    { key: 'timeout_action', label: 'Timeout Action', type: 'select', options: ['continue', 'skip'], defaultValue: 'continue' }
  ], defaultParams: { target: 'player', timeout: 0, timeout_action: 'continue' } },
  wait_until: { type: 'wait_until', label: 'Wait Until', category: 'logic', fields: [
    { key: 'condition_var', label: 'Condition Var', type: 'text', defaultValue: '', placeholder: 'e.g. door_opened' },
    { key: 'condition_equals', label: 'Equals', type: 'text', defaultValue: '', placeholder: 'e.g. true' },
    { key: 'timeout_seconds', label: 'Timeout (seconds, 0=no timeout)', type: 'number', step: 0.1, defaultValue: 0 }
  ], defaultParams: { condition_var: '', condition_equals: '', timeout_seconds: 0 } },
  set_flag: { type: 'set_flag', label: 'Set Flag', category: 'logic', fields: [
    { key: 'key', label: 'Flag Key', type: 'searchable', placeholder: 'story_progress', options: [], defaultValue: '' },
    { key: 'value', label: 'Value', type: 'searchable', placeholder: '1', options: [], defaultValue: '' }
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
  schedule_action: { type: 'schedule_action', label: 'Schedule Action', category: 'logic', fields: [
    { key: 'delay_seconds', label: 'Delay (seconds)', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'action_type', label: 'Action Type', type: 'select', options: ['play_sfx', 'emote', 'flip', 'set_visible', 'set_facing', 'camera_shake', 'halt', 'run_function'], defaultValue: 'play_sfx' },
    { key: 'action_params', label: 'Action Params (JSON)', type: 'json', placeholder: '{"target":"player","sprite":"spr_heart"}', defaultValue: '' },
    { key: 'blocking', label: 'Blocking (wait for inner)', type: 'checkbox', defaultValue: false },
    { key: 'tag', label: 'Tag (optional)', type: 'text', placeholder: 'debug label', defaultValue: '' }
  ], defaultParams: { delay_seconds: 0.5, action_type: 'play_sfx', action_params: '', blocking: false, tag: '' } },
  // Специальная обработка для points array не нужна:
  // - points хранится как массив {x, y}[] в editor params (не как JSON строка)
  // - Общая логика в compileGraph/reverseCompile корректно копирует массивы
  // - В отличие от run_function (args) или set_property (value), где нужна JSON конвертация
  move_relative: { type: 'move_relative', label: 'Move Relative', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'dx', label: 'dX', type: 'number', defaultValue: 0 },
    { key: 'dy', label: 'dY', type: 'number', defaultValue: 0 },
    { key: 'speed_px_sec', label: 'Speed (px/sec)', type: 'number', placeholder: '60', defaultValue: 60 },
    { key: 'collision', label: 'Collision', type: 'select', options: ['false', 'true'], defaultValue: false }
  ], defaultParams: { target: 'player', dx: 0, dy: 0, speed_px_sec: 60, collision: false } },
  set_position_relative: { type: 'set_position_relative', label: 'Set Position Relative', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'dx', label: 'dX', type: 'number', defaultValue: 0 },
    { key: 'dy', label: 'dY', type: 'number', defaultValue: 0 }
  ], defaultParams: { target: 'player', dx: 0, dy: 0 } },
  follow_path: { type: 'follow_path', label: 'Follow Path', category: 'movement', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'speed_px_sec', label: 'Speed (px/sec)', type: 'number', placeholder: '60', defaultValue: 60 },
    { key: 'collision', label: 'Collision', type: 'select', options: ['false', 'true'], defaultValue: false },
    { key: 'autofacing', label: 'Auto Facing', type: 'select', options: ['true', 'false'], defaultValue: true }
  ], defaultParams: { target: 'player', points: [], speed_px_sec: 60, collision: false, autofacing: true } },
  // TODO: tween_camera - legacy node, may need special handling
  tween_camera: { type: 'tween_camera', label: 'Tween Camera', category: 'camera', fields: [
    { key: 'property', label: 'Property', type: 'text', defaultValue: '' },
    { key: 'to_value', label: 'To Value', type: 'number', defaultValue: 0 },
    { key: 'from_value', label: 'From Value (optional)', type: 'number', defaultValue: undefined },
    { key: 'seconds', label: 'Seconds', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'easing', label: 'Easing', type: 'select', options: ['linear', 'ease_in', 'ease_out', 'ease_in_out'], defaultValue: 'linear' }
  ], defaultParams: { property: 'x', to_value: 0, seconds: 1, easing: 'linear', from_value: undefined } },
  // Поля branches, joinId, pairId — editor-only и обрабатываются в compileGraph.ts и reverseCompile.ts.
  // branches: список идентификаторов веток (['b0', 'b1', ...])
  // joinId: ссылка на parallel_join (в parallel_start)
  // pairId: обратная ссылка на parallel_start (в parallel_join)
  // Эти поля фильтруются при экспорте в engine JSON (см. compileGraph.ts строка 610-611).
  checkpoint_state: { type: 'checkpoint_state', label: 'Checkpoint State', category: 'logic', fields: [
    { key: 'checkpoint_id', label: 'Checkpoint ID', type: 'text', defaultValue: '' },
    { key: 'include_actors', label: 'Include Actors', type: 'checkbox', defaultValue: true },
    { key: 'include_player', label: 'Include Player', type: 'checkbox', defaultValue: true },
    { key: 'include_camera', label: 'Include Camera', type: 'checkbox', defaultValue: true },
    { key: 'include_music', label: 'Include Music', type: 'checkbox', defaultValue: true },
    { key: 'include_globals', label: 'Include Globals (JSON array)', type: 'text', defaultValue: '' },
    { key: 'include_instances', label: 'Include Instances (JSON array)', type: 'text', defaultValue: '' }
  ], defaultParams: { checkpoint_id: '', include_actors: true, include_player: true, include_camera: true, include_music: true, include_globals: '', include_instances: '' } },
  restore_state: { type: 'restore_state', label: 'Restore State', category: 'logic', fields: [
    { key: 'checkpoint_id', label: 'Checkpoint ID', type: 'text', defaultValue: '' },
    { key: 'cleanup_transients', label: 'Cleanup Transients', type: 'checkbox', defaultValue: true },
    { key: 'restore_camera', label: 'Restore Camera', type: 'checkbox', defaultValue: true },
    { key: 'restore_music', label: 'Restore Music', type: 'checkbox', defaultValue: true },
    { key: 'on_missing', label: 'On Missing', type: 'select', options: ['warn', 'ignore', 'fail'], defaultValue: 'warn' }
  ], defaultParams: { checkpoint_id: '', cleanup_transients: true, restore_camera: true, restore_music: true, on_missing: 'warn' } },
  parallel_start: { type: 'parallel_start', label: 'Parallel', category: 'logic', fields: [], defaultParams: { branches: ['b0'], joinId: '' } },
  parallel_join: { type: 'parallel_join', label: 'Parallel Join', category: 'logic', fields: [
    { key: 'pairId', label: 'Pair Start Node ID', type: 'text', defaultValue: '' }
  ], defaultParams: { pairId: '' } },
  // Dialogue integration nodes.
  set_dialogue_speed: { type: 'set_dialogue_speed', label: 'Set Dialogue Speed', category: 'dialogue', fields: [
    { key: 'speed', label: 'Chars/sec', type: 'number', step: 0.1, defaultValue: 1.0 }
  ], defaultParams: { speed: 1.0 } },
  wait_typing: { type: 'wait_typing', label: 'Wait Typing', category: 'dialogue', fields: [], defaultParams: {} },
  dialogue_control: { type: 'dialogue_control', label: 'Dialogue Control', category: 'dialogue', fields: [
    { key: 'prevent_skip', label: 'Prevent Skip', type: 'checkbox', defaultValue: false },
    { key: 'stay_open', label: 'Stay Open', type: 'checkbox', defaultValue: false },
    { key: 'auto_advance', label: 'Auto Advance', type: 'checkbox', defaultValue: false }
  ], defaultParams: { prevent_skip: false, stay_open: false, auto_advance: false } },
  set_portrait_next: { type: 'set_portrait_next', label: 'Set Portrait Next', category: 'dialogue', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'emotion', label: 'Emotion', type: 'select', options: ['neutral', 'angry', 'sad', 'scared', 'happy', 'confused', 'surprised'], defaultValue: 'neutral' }
  ], defaultParams: { target: 'player', emotion: 'neutral' } },
  set_portrait_now: { type: 'set_portrait_now', label: 'Set Portrait Now', category: 'dialogue', fields: [
    { key: 'target', label: 'Target', type: 'searchable', placeholder: 'actor key / player', options: [] },
    { key: 'emotion', label: 'Emotion', type: 'select', options: ['neutral', 'angry', 'sad', 'scared', 'happy', 'confused', 'surprised'], defaultValue: 'neutral' }
  ], defaultParams: { target: 'player', emotion: 'neutral' } },
  clear_dialogue: { type: 'clear_dialogue', label: 'Clear Dialogue', category: 'dialogue', fields: [], defaultParams: {} }
}

export const NODE_REGISTRY: Record<string, NodeDefinition> = {
  ...baseNodes,
  ...cameraNodes,
  ...conditionalNodes,
  ...otherNodes
}

// Единый список всех типов нод — источник истины для InspectorPanel и ActionsPanel.
// Генерируется автоматически из NODE_REGISTRY.
export const NODE_TYPES = Object.keys(NODE_REGISTRY) as readonly string[]
