/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { parseYarnPreview } from './yarnPreview'
import type { RuntimeState } from './runtimeTypes'
import type { ValidationContext } from './validators'
import { createTranslator, preloadLanguage } from '../i18n'
import type { SupportedLanguage } from '../i18n'
import type { ProjectResources } from './useProjectResources'
import type { NameConflictModalState } from './inspectorTypes'
import { loadTemplates } from './templateStorage'
import type { CutsceneTemplateSnippet } from './templateStorage'
import type { ValidationRuleOverrides } from './validationRuleOverrides'
import { loadValidationOverrides } from './validationRuleOverrides'

export interface EditorStateReturn {
  // Local state
  sceneFilePath: string | null
  setSceneFilePath: (path: string | null) => void
  preferencesOpen: boolean
  setPreferencesOpen: (open: boolean) => void
  isTutorialActive: boolean
  setIsTutorialActive: (active: boolean) => void
  inspectorTutorialActive: boolean
  setInspectorTutorialActive: (active: boolean) => void
  visualEditingTutorialActive: boolean
  setVisualEditingTutorialActive: (active: boolean) => void
  aboutOpen: boolean
  setAboutOpen: (open: boolean) => void
  appVersion: string
  setAppVersion: (version: string) => void
  yarnPreviewContent: string | null
  setYarnPreviewContent: (content: string | null) => void
  yarnPreviewLoading: boolean
  setYarnPreviewLoading: (loading: boolean) => void
  selectedYarnPreviewTitle: string | null
  setSelectedYarnPreviewTitle: (title: string | null) => void
  templates: CutsceneTemplateSnippet[]
  setTemplates: (templates: CutsceneTemplateSnippet[]) => void
  ruleOverrides: ValidationRuleOverrides
  setRuleOverrides: Dispatch<SetStateAction<ValidationRuleOverrides>>
  welcomeOpen: boolean
  setWelcomeOpen: (open: boolean) => void
  pendingNodeName: string
  setPendingNodeName: (name: string) => void
  nameConflictModal: NameConflictModalState | null
  setNameConflictModal: (state: NameConflictModalState | null) => void
  showSavedIndicator: boolean
  setShowSavedIndicator: (show: boolean) => void
  focusNodeRequest: { nodeId: string; nonce: number } | null
  setFocusNodeRequest: (request: { nodeId: string; nonce: number } | null) => void
  focusPositionRequest: { x: number; y: number; zoom: number; nonce: number } | null
  setFocusPositionRequest: (
    request: { x: number; y: number; zoom: number; nonce: number } | null
  ) => void
  logsFilters: { errors: boolean; warnings: boolean; tips: boolean }
  setLogsFilters: Dispatch<SetStateAction<{ errors: boolean; warnings: boolean; tips: boolean }>>

  // Refs
  nameConflictOkRef: React.RefObject<HTMLButtonElement | null>
  canvasCenterRef: React.MutableRefObject<{ x: number; y: number } | null>
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>

  // Memoized values
  validationContext: ValidationContext | undefined
  actorTargetOptions: string[]
  yarnPreviewNodes: ReturnType<typeof parseYarnPreview>

  // Handlers
  handleWelcomeComplete: () => void
  handleTutorialComplete: () => void
  handleTutorialSkip: () => void
  handleInspectorTutorialComplete: () => void
  handleInspectorTutorialSkip: () => void
  handleVisualEditingTutorialComplete: () => void
  handleVisualEditingTutorialSkip: () => void
}

export function useEditorState(
  preferences: {
    language: string | null
    hasCompletedInitialSetup: boolean
    hasCompletedTutorial: boolean
    hasCompletedInspectorTutorial: boolean
    hasCompletedVisualEditingTutorial: boolean
  },
  preferencesLoaded: boolean,
  updatePreferences: (
    prefs: Partial<{
      hasCompletedInitialSetup: boolean
      hasCompletedTutorial: boolean
      hasCompletedInspectorTutorial: boolean
      hasCompletedVisualEditingTutorial: boolean
    }>
  ) => void,
  resources: ProjectResources | null,
  engineSettings: { runFunctions?: unknown; branchConditions?: unknown } | null,
  yarnFiles: { file: string; nodes: unknown[] }[] | null,
  runtime: Pick<
    RuntimeState,
    'nodes' | 'selectedNodeId' | 'selectedNodeIds' | 'selectedEdgeId' | 'notes'
  >
): EditorStateReturn {
  const t = useMemo(
    () => createTranslator((preferences.language as SupportedLanguage) ?? 'en'),
    [preferences.language]
  )

  // Local state
  const [sceneFilePath, setSceneFilePath] = useState<string | null>(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [isTutorialActive, setIsTutorialActive] = useState(false)

  const [inspectorTutorialActive, setInspectorTutorialActive] = useState(false)
  const [visualEditingTutorialActive, setVisualEditingTutorialActive] = useState(false)

  const [aboutOpen, setAboutOpen] = useState(false)
  const [appVersion, setAppVersion] = useState(t('app.loading', 'Loading...'))

  const [yarnPreviewContent, setYarnPreviewContent] = useState<string | null>(null)
  const [yarnPreviewLoading, setYarnPreviewLoading] = useState(false)
  const [selectedYarnPreviewTitle, setSelectedYarnPreviewTitle] = useState<string | null>(null)

  const [templates, setTemplates] = useState<CutsceneTemplateSnippet[]>([])

  const [ruleOverrides, setRuleOverrides] = useState<ValidationRuleOverrides>({})

  const [welcomeOpen, setWelcomeOpen] = useState(false)

  const [pendingNodeName, setPendingNodeName] = useState('')
  const [nameConflictModal, setNameConflictModal] = useState<NameConflictModalState | null>(null)
  const nameConflictOkRef = useRef<HTMLButtonElement | null>(null)

  const [showSavedIndicator, setShowSavedIndicator] = useState(false)

  const [focusNodeRequest, setFocusNodeRequest] = useState<{
    nodeId: string
    nonce: number
  } | null>(null)
  const [focusPositionRequest, setFocusPositionRequest] = useState<{
    x: number
    y: number
    zoom: number
    nonce: number
  } | null>(null)

  const [logsFilters, setLogsFilters] = useState({ errors: true, warnings: true, tips: true })

  const canvasCenterRef = useRef<{ x: number; y: number } | null>(null)
  const shouldFocusEdgeWaitRef = useRef(false)

  // Onboarding Flow
  useEffect(() => {
    if (!preferencesLoaded) return
    if (!preferences.hasCompletedInitialSetup) {
      setWelcomeOpen(true)
    } else if (!preferences.hasCompletedTutorial) {
      setIsTutorialActive(true)
    }
  }, [preferencesLoaded, preferences.hasCompletedInitialSetup, preferences.hasCompletedTutorial])

  // Предзагрузка словаря i18n для выбранного языка
  useEffect(() => {
    if (!preferencesLoaded) return
    preloadLanguage((preferences.language as SupportedLanguage) ?? 'en').catch((error) => {
      console.error('Failed to preload language:', error)
    })
  }, [preferencesLoaded, preferences.language])

  // Отложенная загрузка templates и validation overrides
  useEffect(() => {
    if (!preferencesLoaded) return

    const stored = loadTemplates()
    if (stored?.templates) {
      setTemplates(stored.templates)
    }

    const overrides = loadValidationOverrides()
    setRuleOverrides(overrides)
  }, [preferencesLoaded])

  const handleWelcomeComplete = useCallback(() => {
    updatePreferences({ hasCompletedInitialSetup: true })
    setWelcomeOpen(false)
  }, [updatePreferences])

  const handleTutorialComplete = useCallback(() => {
    updatePreferences({ hasCompletedTutorial: true })
    setIsTutorialActive(false)
  }, [updatePreferences])

  const handleTutorialSkip = useCallback(() => {
    updatePreferences({ hasCompletedTutorial: true })
    setIsTutorialActive(false)
  }, [updatePreferences])

  // Контекстный тур по инспектору запускается при первом выборе ноды
  useEffect(() => {
    if (!preferencesLoaded) return
    if (preferences.hasCompletedInspectorTutorial) return
    if (!preferences.hasCompletedTutorial) return
    if (runtime.selectedNodeId) {
      setInspectorTutorialActive(true)
    }
  }, [
    preferencesLoaded,
    preferences.hasCompletedInspectorTutorial,
    preferences.hasCompletedTutorial,
    runtime.selectedNodeId
  ])

  const handleInspectorTutorialComplete = useCallback(() => {
    updatePreferences({ hasCompletedInspectorTutorial: true })
    setInspectorTutorialActive(false)
  }, [updatePreferences])

  const handleInspectorTutorialSkip = useCallback(() => {
    updatePreferences({ hasCompletedInspectorTutorial: true })
    setInspectorTutorialActive(false)
  }, [updatePreferences])

  useEffect(() => {
    if (!aboutOpen) return
    if (!window.api?.appInfo?.getVersion) return

    window.api.appInfo
      .getVersion()
      .then((version) => {
        setAppVersion(version)
      })
      .catch((err) => {
        console.warn('Failed to read app version:', err)
        setAppVersion(t('app.unknown', 'Unknown'))
      })
  }, [aboutOpen, t])

  // Yarn preview
  useEffect(() => {
    const selectedNode = runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null
    const selectedFile =
      selectedNode?.type === 'dialogue' ? String(selectedNode.params?.file ?? '').trim() : ''
    const projectDir = resources?.projectDir ?? ''

    if (!selectedNode || selectedNode.type !== 'dialogue' || !selectedFile || !projectDir) {
      setYarnPreviewContent(null)
      setYarnPreviewLoading(false)
      setSelectedYarnPreviewTitle(null)
      return
    }

    if (!window.api?.yarn?.readFile) {
      setYarnPreviewContent(null)
      setYarnPreviewLoading(false)
      setSelectedYarnPreviewTitle(null)
      return
    }

    let cancelled = false
    setYarnPreviewLoading(true)

    window.api.yarn
      .readFile(projectDir, selectedFile)
      .then((raw) => {
        if (cancelled) return

        const normalizedRaw = typeof raw === 'string' ? raw : null
        setYarnPreviewContent(normalizedRaw)

        const selectedNodeTitle = String(selectedNode.params?.node ?? '').trim()
        const parsedPreviewNodes = normalizedRaw ? parseYarnPreview(normalizedRaw) : []
        const hasRequestedTitle = parsedPreviewNodes.some(
          (entry) => entry.title === selectedNodeTitle
        )

        setSelectedYarnPreviewTitle(
          hasRequestedTitle
            ? selectedNodeTitle
            : parsedPreviewNodes.length > 0
              ? parsedPreviewNodes[0].title
              : null
        )
        setYarnPreviewLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to read yarn file for preview:', err)
        setYarnPreviewContent(null)
        setSelectedYarnPreviewTitle(null)
        setYarnPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [resources?.projectDir, runtime.nodes, runtime.selectedNodeId])

  // Visual editing tutorial handlers (effect is in EditorShell)
  const handleVisualEditingTutorialComplete = useCallback(() => {
    updatePreferences({ hasCompletedVisualEditingTutorial: true })
    setVisualEditingTutorialActive(false)
  }, [updatePreferences])

  const handleVisualEditingTutorialSkip = useCallback(() => {
    updatePreferences({ hasCompletedVisualEditingTutorial: true })
    setVisualEditingTutorialActive(false)
  }, [updatePreferences])

  // Name conflict modal effects
  useEffect(() => {
    if (!nameConflictModal) return
    const t = window.setTimeout(() => {
      nameConflictOkRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [nameConflictModal])

  useEffect(() => {
    if (!nameConflictModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setPendingNodeName(nameConflictModal.previousName)
      setNameConflictModal(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nameConflictModal, setPendingNodeName, setNameConflictModal])

  // Memoized values
  const validationContext: ValidationContext | undefined = useMemo(() => {
    if (!resources && !engineSettings) {
      return { language: (preferences.language as SupportedLanguage) ?? 'en' }
    }
    return {
      language: (preferences.language as SupportedLanguage) ?? 'en',
      objects: resources?.objects,
      sprites: resources?.sprites,
      yarnFiles: yarnFiles
        ? new Map(yarnFiles.map((y) => [y.file, y.nodes as string[]]))
        : undefined,
      runFunctions: engineSettings?.runFunctions as string[] | undefined,
      branchConditions: engineSettings?.branchConditions as string[] | undefined
    }
  }, [preferences.language, resources, engineSettings, yarnFiles])

  const actorTargetOptions = useMemo(() => {
    const result = new Set<string>(['player'])

    for (const objectName of resources?.objects ?? []) {
      if (objectName) result.add(objectName)
    }

    for (const node of runtime.nodes) {
      if (node.type !== 'actor_create') continue
      const actorKey = String(node.params?.actor_name ?? '').trim()
      if (actorKey) result.add(actorKey)
    }

    return [...result]
  }, [resources?.objects, runtime.nodes])

  const yarnPreviewNodes = useMemo(
    () => (yarnPreviewContent ? parseYarnPreview(yarnPreviewContent) : []),
    [yarnPreviewContent]
  )

  return {
    sceneFilePath,
    setSceneFilePath,
    preferencesOpen,
    setPreferencesOpen,
    isTutorialActive,
    setIsTutorialActive,
    inspectorTutorialActive,
    setInspectorTutorialActive,
    visualEditingTutorialActive,
    setVisualEditingTutorialActive,
    aboutOpen,
    setAboutOpen,
    appVersion,
    setAppVersion,
    yarnPreviewContent,
    setYarnPreviewContent,
    yarnPreviewLoading,
    setYarnPreviewLoading,
    selectedYarnPreviewTitle,
    setSelectedYarnPreviewTitle,
    templates,
    setTemplates,
    ruleOverrides,
    setRuleOverrides,
    welcomeOpen,
    setWelcomeOpen,
    pendingNodeName,
    setPendingNodeName,
    nameConflictModal,
    setNameConflictModal,
    showSavedIndicator,
    setShowSavedIndicator,
    focusNodeRequest,
    setFocusNodeRequest,
    focusPositionRequest,
    setFocusPositionRequest,
    logsFilters,
    setLogsFilters,
    nameConflictOkRef,
    canvasCenterRef,
    shouldFocusEdgeWaitRef,
    validationContext,
    actorTargetOptions,
    yarnPreviewNodes,
    handleWelcomeComplete,
    handleTutorialComplete,
    handleTutorialSkip,
    handleInspectorTutorialComplete,
    handleInspectorTutorialSkip,
    handleVisualEditingTutorialComplete,
    handleVisualEditingTutorialSkip
  }
}
