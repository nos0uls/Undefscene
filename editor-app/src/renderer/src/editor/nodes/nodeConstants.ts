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
