import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VisualEditorActorPreview, LoadedActorSpritePreview } from './RoomVisualEditorTypes'

export const ACTOR_MARKER_RADIUS = 8
export const PLAY_PREVIEW_SPEED_PX_PER_SEC = 180

// Возвращаем точку на path по дистанции от начала.
export function getPointAtDistanceOnPreparedPath(
  segments: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    startDistance: number
    endDistance: number
    length: number
  }>,
  distance: number,
  fallbackPoint: { x: number; y: number },
  startIndex = 0
): { point: { x: number; y: number }; segmentIndex: number } {
  if (segments.length <= 0) {
    return { point: { ...fallbackPoint }, segmentIndex: 0 }
  }

  const normalizedDistance = Math.max(0, distance)
  let segmentIndex = Math.max(0, Math.min(startIndex, segments.length - 1))

  while (
    segmentIndex < segments.length - 1 &&
    normalizedDistance > segments[segmentIndex].endDistance
  ) {
    segmentIndex += 1
  }

  const segment = segments[segmentIndex]
  if (!segment) {
    return { point: { ...fallbackPoint }, segmentIndex: 0 }
  }

  if (normalizedDistance <= segment.startDistance) {
    return { point: { ...segment.startPoint }, segmentIndex }
  }

  const segmentProgress = (normalizedDistance - segment.startDistance) / segment.length
  const point = {
    x: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * segmentProgress,
    y: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * segmentProgress
  }

  return { point, segmentIndex }
}

// То же сравнение для actor preview entries.
export function getActorPreviewsSyncKey(actors: VisualEditorActorPreview[]): string {
  return actors
    .map((actor) => {
      const spriteOrObject = String(actor.spriteOrObject ?? '')
      return `${actor.id}:${actor.key}:${Math.round(actor.x)}:${Math.round(actor.y)}:${spriteOrObject}:${actor.isVirtual === true ? '1' : '0'}`
    })
    .join('|')
}

type UseActorEditorLogicProps = {
  open: boolean
  actorPreviews: VisualEditorActorPreview[]
  selectedActorTarget: string | null
  projectDir: string | null
  preparedDraftPathSegments: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    startDistance: number
    endDistance: number
    length: number
  }>
  preparedDraftPathTotalLength: number
  onImportActors: (actors: VisualEditorActorPreview[]) => void
}

export function useActorEditorLogic({
  open,
  actorPreviews,
  selectedActorTarget,
  projectDir,
  preparedDraftPathSegments,
  preparedDraftPathTotalLength,
  onImportActors
}: UseActorEditorLogicProps) {
  const [draftActors, setDraftActors] = useState<VisualEditorActorPreview[]>([])
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)
  const [isActorPlacementMode, setIsActorPlacementMode] = useState(false)
  const [isPlayPreviewRunning, setIsPlayPreviewRunning] = useState(false)
  const [playPreviewPoint, setPlayPreviewPoint] = useState<{ x: number; y: number } | null>(null)
  const [actorSpritePreviews, setActorSpritePreviews] = useState<
    Record<string, LoadedActorSpritePreview>
  >({})

  const actorDragRef = useRef<{
    pointerId: number
    actorId: string
    startWorldPoint: { x: number; y: number }
    startActorX: number
    startActorY: number
  } | null>(null)

  const playPreviewStartTimeRef = useRef(0)
  const playPreviewSegmentIndexRef = useRef(0)
  const playPreviewAnimationRef = useRef<number | null>(null)
  const lastSyncedActorsKeyRef = useRef('')

  // Если реальных actor_create нет, собираем виртуальные preview entries.
  const effectiveActorPreviews = useMemo(() => {
    if (actorPreviews.length > 0) {
      return actorPreviews
    }

    const fallbackActors: VisualEditorActorPreview[] = []
    const pushVirtualActor = (actorKey: string): void => {
      const normalizedKey = actorKey.trim()
      if (!normalizedKey) {
        return
      }
      if (fallbackActors.some((actor) => actor.key === normalizedKey)) {
        return
      }

      fallbackActors.push({
        id: `virtual:${normalizedKey}`,
        key: normalizedKey,
        x: 0,
        y: 0,
        spriteOrObject: normalizedKey.toLowerCase() === 'player' ? 'obj_player' : '',
        isVirtual: true
      })
    }

    pushVirtualActor(selectedActorTarget ?? '')
    pushVirtualActor('player')
    return fallbackActors
  }, [actorPreviews, selectedActorTarget])

  // Actor preview markers тоже копируем локально.
  useEffect(() => {
    if (!open) return
    const nextActorsKey = getActorPreviewsSyncKey(effectiveActorPreviews)
    if (lastSyncedActorsKeyRef.current === nextActorsKey) {
      return
    }

    lastSyncedActorsKeyRef.current = nextActorsKey
    setDraftActors(effectiveActorPreviews.map((actor) => ({ ...actor })))
    setSelectedActorId((prev) =>
      effectiveActorPreviews.some((actor) => actor.id === prev)
        ? prev
        : (effectiveActorPreviews[0]?.id ?? null)
    )
  }, [effectiveActorPreviews, open])

  // Для sprite preview важен только список resource names.
  const actorSpriteResourceNames = useMemo(
    () =>
      Array.from(
        new Set(
          draftActors
            .map((actor) => {
              const directResource = actor.spriteOrObject.trim()
              if (directResource) {
                return directResource
              }

              const fallbackResource = actor.isVirtual ? actor.key.trim() : ''
              return fallbackResource
            })
            .filter((resourceName) => resourceName.length > 0)
        )
      ),
    [draftActors]
  )

  // Подгружаем sprite previews.
  useEffect(() => {
    if (!open || !projectDir || !window.api?.project?.readActorSpritePreview) {
      setActorSpritePreviews({})
      return
    }

    if (actorSpriteResourceNames.length <= 0) {
      setActorSpritePreviews({})
      return
    }

    let cancelled = false
    Promise.all(
      actorSpriteResourceNames.map(async (resourceName) => {
        try {
          const preview = (await window.api.project.readActorSpritePreview(
            projectDir,
            resourceName
          )) as LoadedActorSpritePreview | null
          return preview ? ([resourceName, preview] as const) : null
        } catch {
          return null
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return
      }

      const nextPreviews: Record<string, LoadedActorSpritePreview> = {}
      for (const entry of entries) {
        if (!entry) {
          continue
        }

        nextPreviews[entry[0]] = entry[1]
      }

      setActorSpritePreviews(nextPreviews)
    })

    return () => {
      cancelled = true
    }
  }, [actorSpriteResourceNames, open, projectDir])

  // Ищем actor marker под курсором в режиме Select.
  const findActorAtPoint = useCallback(
    (point: { x: number; y: number }): VisualEditorActorPreview | null => {
      for (let index = draftActors.length - 1; index >= 0; index -= 1) {
        const actor = draftActors[index]
        const displayPoint =
          actor.id === selectedActorId && playPreviewPoint
            ? playPreviewPoint
            : { x: actor.x, y: actor.y }

        if (
          Math.hypot(displayPoint.x - point.x, displayPoint.y - point.y) <=
          ACTOR_MARKER_RADIUS + 6
        ) {
          return actor
        }
      }

      return null
    },
    [draftActors, playPreviewPoint, selectedActorId]
  )

  // Для preview сначала используем actor_sprite из actor_create.
  const getActorSpritePreview = useCallback(
    (actor: VisualEditorActorPreview): LoadedActorSpritePreview | null => {
      const directResource = actor.spriteOrObject.trim()
      if (directResource && actorSpritePreviews[directResource]) {
        return actorSpritePreviews[directResource]
      }

      const fallbackResource = actor.isVirtual ? actor.key.trim() : ''
      if (fallbackResource && actorSpritePreviews[fallbackResource]) {
        return actorSpritePreviews[fallbackResource]
      }

      return null
    },
    [actorSpritePreviews]
  )

  const stopPlayPreview = useCallback((): void => {
    if (playPreviewAnimationRef.current !== null) {
      cancelAnimationFrame(playPreviewAnimationRef.current)
      playPreviewAnimationRef.current = null
    }
    setIsPlayPreviewRunning(false)
    setPlayPreviewPoint(null)
    playPreviewStartTimeRef.current = 0
    playPreviewSegmentIndexRef.current = 0
  }, [])

  const togglePlayPreview = useCallback((): void => {
    if (isPlayPreviewRunning) {
      stopPlayPreview()
      return
    }

    if (!selectedActorId || preparedDraftPathSegments.length <= 0) {
      return
    }

    setIsPlayPreviewRunning(true)
    playPreviewStartTimeRef.current = performance.now()
    playPreviewSegmentIndexRef.current = 0

    const animate = (currentTime: number): void => {
      const elapsed = currentTime - playPreviewStartTimeRef.current
      const distance = (elapsed / 1000) * PLAY_PREVIEW_SPEED_PX_PER_SEC

      if (distance >= preparedDraftPathTotalLength) {
        stopPlayPreview()
        return
      }

      const { point, segmentIndex } = getPointAtDistanceOnPreparedPath(
        preparedDraftPathSegments,
        distance,
        { x: 0, y: 0 },
        playPreviewSegmentIndexRef.current
      )

      playPreviewSegmentIndexRef.current = segmentIndex
      setPlayPreviewPoint(point)
      playPreviewAnimationRef.current = requestAnimationFrame(animate)
    }

    playPreviewAnimationRef.current = requestAnimationFrame(animate)
  }, [
    isPlayPreviewRunning,
    selectedActorId,
    preparedDraftPathSegments,
    preparedDraftPathTotalLength,
    stopPlayPreview
  ])

  // Actor markers импортируем отдельным явным действием.
  const importDraftActors = useCallback((): void => {
    const importableActors = draftActors.filter((actor) => actor.isVirtual !== true)
    if (importableActors.length <= 0) {
      return
    }
    onImportActors(importableActors)
  }, [draftActors, onImportActors])

  // Очищаем preview при закрытии.
  useEffect(() => {
    if (!open) {
      stopPlayPreview()
    }
  }, [open, stopPlayPreview])

  // Cleanup RAF loop on unmount.
  useEffect(() => {
    return () => {
      stopPlayPreview()
    }
  }, [stopPlayPreview])

  const selectedActor = useMemo(
    () => draftActors.find((actor) => actor.id === selectedActorId) ?? null,
    [draftActors, selectedActorId]
  )

  const hasImportableActors = useMemo(
    () => draftActors.some((actor) => actor.isVirtual !== true),
    [draftActors]
  )

  const actorOptionEntries = useMemo(
    () =>
      draftActors.map((actor, index) => ({
        id: actor.id,
        label: `${actor.key || actor.id} · ${actor.spriteOrObject || (actor.isVirtual ? 'virtual' : 'actor')} · #${index + 1}`
      })),
    [draftActors]
  )

  return {
    // State
    draftActors,
    selectedActorId,
    isActorPlacementMode,
    isPlayPreviewRunning,
    playPreviewPoint,
    selectedActor,
    hasImportableActors,
    actorOptionEntries,
    actorSpritePreviews,
    // Refs
    actorDragRef,
    // Actions
    setDraftActors,
    setSelectedActorId,
    setIsActorPlacementMode,
    stopPlayPreview,
    togglePlayPreview,
    importDraftActors,
    findActorAtPoint,
    getActorSpritePreview,
    // Constants
    ACTOR_MARKER_RADIUS
  }
}
