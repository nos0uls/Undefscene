// tutorialConstants.ts — Данные и типы для интерактивного тура.
// Вынесено из TutorialOverlay.tsx для совместимости с Vite Fast Refresh.

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type TutorialStep = {
  selector?: string
  title: string
  content: string
  position?: TooltipPosition
}

const ONBOARDING_STEPS: TutorialStep[] = [
  {
    title: 'tutorial.onboarding.steps.0.title',
    content: 'tutorial.onboarding.steps.0.content',
    position: 'center'
  },
  {
    selector: '.topMenuBar',
    title: 'tutorial.onboarding.steps.1.title',
    content: 'tutorial.onboarding.steps.1.content',
    position: 'bottom'
  },
  {
    selector: '.editorLeftDock',
    title: 'tutorial.onboarding.steps.2.title',
    content: 'tutorial.onboarding.steps.2.content',
    position: 'right'
  },
  {
    selector: '.editorCenter',
    title: 'tutorial.onboarding.steps.3.title',
    content: 'tutorial.onboarding.steps.3.content',
    position: 'center'
  },
  {
    selector: '.editorRightDock',
    title: 'tutorial.onboarding.steps.4.title',
    content: 'tutorial.onboarding.steps.4.content',
    position: 'left'
  },
  {
    selector: '.editorBottomDock',
    title: 'tutorial.onboarding.steps.5.title',
    content: 'tutorial.onboarding.steps.5.content',
    position: 'top'
  },
  {
    title: 'tutorial.onboarding.steps.6.title',
    content: 'tutorial.onboarding.steps.6.content',
    position: 'center'
  }
]

const INSPECTOR_STEPS: TutorialStep[] = [
  {
    selector: '.editorRightDock',
    title: 'tutorial.inspector.steps.0.title',
    content: 'tutorial.inspector.steps.0.content',
    position: 'left'
  },
  {
    selector: '.editorRightDock .paramField',
    title: 'tutorial.inspector.steps.1.title',
    content: 'tutorial.inspector.steps.1.content',
    position: 'left'
  }
]

const VISUAL_EDITING_STEPS: TutorialStep[] = [
  {
    selector: '.roomScreenshotCanvas',
    title: 'editor.visualEditingTitle',
    content: 'editor.visualEditingPathHint',
    position: 'center'
  }
]

export const TUTORIAL_REGISTRY: Record<string, TutorialStep[]> = {
  onboarding: ONBOARDING_STEPS,
  inspector: INSPECTOR_STEPS,
  visualEditing: VISUAL_EDITING_STEPS
}
