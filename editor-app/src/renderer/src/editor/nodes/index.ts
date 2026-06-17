// Регистрация всех кастомных нод для React Flow.
// Этот объект передаётся в <ReactFlow nodeTypes={...} />.

import {
  StartNode,
  EndNode,
  WaitNode,
  HaltNode
} from './flow'

import {
  MoveNode,
  FollowPathNode,
  SetPositionNode,
  MoveRelativeNode,
  SetPositionRelativeNode,
  JumpNode,
  MoveDirectNode,
  MoveRelativeDirectionNode
} from './movement'

import {
  DialogueNode,
  WaitForDialogueNode,
  SetDialogueSpeedNode,
  WaitTypingNode,
  DialogueControlNode,
  SetPortraitNextNode,
  SetPortraitNowNode,
  ClearDialogueNode
} from './dialogue'

import {
  CameraTrackNode,
  CameraTrackUntilStopNode,
  CameraPanNode,
  CameraPanObjNode,
  CameraCenterNode,
  CameraShakeNode,
  TweenCameraNode,
  CameraPanSpeedNode
} from './camera'

import {
  PlaySFXNode,
  PlayMusicNode,
  StopMusicNode,
  MusicVolumeNode,
  MusicDuckNode,
  MusicUnduckNode,
  MusicPitchNode,
  MusicPauseNode,
  MusicResumeNode,
  PlayBossMusicNode,
  StopBossMusicNode,
  BossMusicPhaseNode,
  PlayMusicIntroNode,
  PlayMusicIntroLayeredNode,
  CrossfadeMusicNode
} from './audio'

import {
  ActorCreateNode,
  ActorDestroyNode,
  AnimateNode,
  SetAnimationFrameNode,
  SetFacingNode,
  SetDepthNode,
  AutoFacingNode,
  AutoWalkNode,
  FadeInNode,
  FadeOutNode,
  EmoteNode,
  FlipNode,
  SpinNode,
  ShakeObjectNode,
  SetVisibleNode,
  InstantModeNode,
  SetEmotionNode,
  LerpNode
} from './visual'

import {
  BranchNode,
  RunFunctionNode,
  ParallelStartNode,
  ParallelJoinNode,
  PartialControlNode,
  WaitInteractNode,
  WaitUntilNode,
  SetFlagNode,
  SpawnEntityNode,
  DestroyEntityNode,
  SetPlotNode,
  ScheduleActionNode,
  AttachToTargetNode,
  CheckpointStateNode,
  RestoreStateNode,
  DetachNode,
  RoomChangeNode,
  SetPropertyNode,
  TweenNode
} from './logic'

// Маппинг: тип ноды → React-компонент.
// React Flow использует этот объект, чтобы рендерить правильный компонент для каждого типа.
export const cutsceneNodeTypes = {
  start: StartNode,
  end: EndNode,
  wait: WaitNode,
  halt: HaltNode,

  move: MoveNode,
  follow_path: FollowPathNode,
  set_position: SetPositionNode,
  move_relative: MoveRelativeNode,
  set_position_relative: SetPositionRelativeNode,
  jump: JumpNode,
  move_direct: MoveDirectNode,
  move_relative_direction: MoveRelativeDirectionNode,

  dialogue: DialogueNode,
  wait_for_dialogue: WaitForDialogueNode,
  set_dialogue_speed: SetDialogueSpeedNode,
  wait_typing: WaitTypingNode,
  dialogue_control: DialogueControlNode,
  set_portrait_next: SetPortraitNextNode,
  set_portrait_now: SetPortraitNowNode,
  clear_dialogue: ClearDialogueNode,

  camera_track: CameraTrackNode,
  camera_track_until_stop: CameraTrackUntilStopNode,
  camera_pan: CameraPanNode,
  camera_pan_obj: CameraPanObjNode,
  camera_center: CameraCenterNode,
  camera_shake: CameraShakeNode,
  tween_camera: TweenCameraNode,
  camera_pan_speed: CameraPanSpeedNode,

  play_sfx: PlaySFXNode,
  play_music: PlayMusicNode,
  stop_music: StopMusicNode,
  music_volume: MusicVolumeNode,
  music_duck: MusicDuckNode,
  music_unduck: MusicUnduckNode,
  music_pitch: MusicPitchNode,
  music_pause: MusicPauseNode,
  music_resume: MusicResumeNode,
  play_boss_music: PlayBossMusicNode,
  stop_boss_music: StopBossMusicNode,
  boss_music_phase: BossMusicPhaseNode,
  play_music_intro: PlayMusicIntroNode,
  play_music_intro_layered: PlayMusicIntroLayeredNode,
  crossfade_music: CrossfadeMusicNode,

  actor_create: ActorCreateNode,
  actor_destroy: ActorDestroyNode,
  animate: AnimateNode,
  set_animation_frame: SetAnimationFrameNode,
  set_facing: SetFacingNode,
  set_depth: SetDepthNode,
  auto_facing: AutoFacingNode,
  auto_walk: AutoWalkNode,
  fade_in: FadeInNode,
  fade_out: FadeOutNode,
  emote: EmoteNode,
  flip: FlipNode,
  spin: SpinNode,
  shake_object: ShakeObjectNode,
  set_visible: SetVisibleNode,
  instant_mode: InstantModeNode,
  set_emotion: SetEmotionNode,
  lerp: LerpNode,

  branch: BranchNode,
  run_function: RunFunctionNode,
  parallel_start: ParallelStartNode,
  parallel_join: ParallelJoinNode,
  partial_control: PartialControlNode,
  wait_for_interact: WaitInteractNode,
  wait_until: WaitUntilNode,
  set_flag: SetFlagNode,
  spawn_entity: SpawnEntityNode,
  destroy_entity: DestroyEntityNode,
  set_plot: SetPlotNode,
  schedule_action: ScheduleActionNode,
  attach_to_target: AttachToTargetNode,
  checkpoint_state: CheckpointStateNode,
  restore_state: RestoreStateNode,
  detach: DetachNode,
  room_change: RoomChangeNode,
  set_property: SetPropertyNode,
  tween: TweenNode
} as const
