// Регистрация всех кастомных нод для React Flow.
// Этот объект передаётся в <ReactFlow nodeTypes={...} />.
import {
  StartNode,
  EndNode,
  WaitNode,
  MoveNode,
  FollowPathNode,
  SetPositionNode,
  ActorCreateNode,
  ActorDestroyNode,
  AnimateNode,
  SetFacingNode,
  SetDepthNode,
  DialogueNode,
  CameraTrackNode,
  CameraPanNode,
  ParallelStartNode,
  ParallelJoinNode,
  BranchNode,
  RunFunctionNode
} from './CutsceneNodes'

// Маппинг: тип ноды → React-компонент.
// React Flow использует этот объект, чтобы рендерить правильный компонент для каждого типа.
export const cutsceneNodeTypes = {
  start: StartNode,
  end: EndNode,
  wait: WaitNode,
  move: MoveNode,
  follow_path: FollowPathNode,
  set_position: SetPositionNode,
  actor_create: ActorCreateNode,
  actor_destroy: ActorDestroyNode,
  animate: AnimateNode,
  set_facing: SetFacingNode,
  set_depth: SetDepthNode,
  dialogue: DialogueNode,
  camera_track: CameraTrackNode,
  camera_pan: CameraPanNode,
  // Parallel делаем как пару нод: fork + join.
  parallel_start: ParallelStartNode,
  parallel_join: ParallelJoinNode,
  branch: BranchNode,
  run_function: RunFunctionNode
} as const
