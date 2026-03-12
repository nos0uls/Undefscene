// Цвета категорий нод — используют CSS-переменные из системы токенов.
// Каждая категория имеет свой цвет для визуального различения на canvas.
export const NODE_COLORS: Record<string, string> = {
  flow: 'var(--node-start)', // start, end, wait — синий
  movement: 'var(--node-animate)', // move, follow_path, set_position — фиолетовый
  actor: 'var(--node-animate)', // actor_create, actor_destroy — фиолетовый
  visual: 'var(--node-animate)', // animate, set_facing, set_depth, auto_facing, auto_walk
  dialogue: 'var(--node-dialogue)', // dialogue — розовый
  camera: 'var(--node-camera)', // camera_track, camera_pan, camera_shake — зелёный
  logic: 'var(--node-logic)', // parallel, branch, run_function — оранжевый
  audio: 'var(--node-audio)', // play_sound, play_music — бирюзовый
  wait: 'var(--node-wait)' // wait-related — серо-синий
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
  camera_shake: 'camera',
  auto_facing: 'visual',
  auto_walk: 'visual'
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
  camera_shake: 'Camera Shake',
  auto_facing: 'Auto Facing',
  auto_walk: 'Auto Walk'
}
