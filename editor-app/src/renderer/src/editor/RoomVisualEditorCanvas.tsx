import { useEffect, useMemo, useRef } from 'react'
import { createTranslator, type SupportedLanguage } from '../i18n'
import type { RoomScreenshotBundle } from './RoomVisualEditorTypes'

type RoomVisualEditorCanvasProps = {
  bundle: RoomScreenshotBundle | null
  language: SupportedLanguage
  onStitchError?: (message: string | null) => void
}

// Грузим data URL в HTMLImageElement, чтобы потом можно было нарисовать tile на canvas.
export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load tile image'))
    img.src = dataUrl
  })
}

export const RoomVisualEditorCanvas = ({
  bundle,
  language,
  onStitchError
}: RoomVisualEditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = useMemo(() => createTranslator(language), [language])

  // Кеш уже склеенных комнат
  const stitchedRoomCacheRef = useRef<Map<string, string>>(new Map())

  // Stitch draw: собираем все тайлы на один canvas.
  // Тут renderer удобнее всего, потому что canvas API уже рядом с UI tool surface.
  useEffect(() => {
    const canvas = canvasRef.current
    const meta = bundle?.meta

    if (!canvas || !meta) {
      if (canvas) {
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    let cancelled = false

    const draw = async (): Promise<void> => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const roomWidth = Math.max(1, Math.round(meta.room_width))
      const roomHeight = Math.max(1, Math.round(meta.room_height))
      canvas.width = roomWidth
      canvas.height = roomHeight
      ctx.clearRect(0, 0, roomWidth, roomHeight)
      ctx.imageSmoothingEnabled = false

      const cachedStitchedRoom = bundle?.cacheKey
        ? stitchedRoomCacheRef.current.get(bundle.cacheKey)
        : null
      if (cachedStitchedRoom) {
        const cachedImage = await loadImage(cachedStitchedRoom)
        if (cancelled) return
        ctx.drawImage(cachedImage, 0, 0, roomWidth, roomHeight)
        onStitchError?.(null)
        return
      }

      const loadedTiles = await Promise.all(
        (bundle?.tiles ?? []).map(async (tile) => ({
          tile,
          image: await loadImage(tile.dataUrl)
        }))
      )

      if (cancelled) return

      for (const { tile, image } of loadedTiles) {
        const rawX = tile.col * meta.capture_width
        const rawY = tile.row * meta.capture_height

        // Позицию и размер тайла берём из meta contract,
        // а не из natural image size. Это важно для стабильного stitch,
        // если браузер/Electron отдаёт PNG с неожиданным scale factor.
        const tileWidth = Math.max(1, Math.round(meta.capture_width))
        const tileHeight = Math.max(1, Math.round(meta.capture_height))

        // Для edge clamp последний tile всё равно рисуем так,
        // чтобы он заканчивался ровно на границе комнаты.
        const drawX = Math.max(0, Math.min(rawX, roomWidth - tileWidth))
        const drawY = Math.max(0, Math.min(rawY, roomHeight - tileHeight))
        ctx.drawImage(image, drawX, drawY, tileWidth, tileHeight)
      }

      if (bundle?.cacheKey) {
        if (stitchedRoomCacheRef.current.has(bundle.cacheKey)) {
          stitchedRoomCacheRef.current.delete(bundle.cacheKey)
        }

        stitchedRoomCacheRef.current.set(bundle.cacheKey, canvas.toDataURL('image/png'))
        while (stitchedRoomCacheRef.current.size > 8) {
          const oldestKey = stitchedRoomCacheRef.current.keys().next().value
          if (!oldestKey) {
            break
          }
          stitchedRoomCacheRef.current.delete(oldestKey)
        }
      }

      onStitchError?.(null)
    }

    void draw().catch((error) => {
      console.warn('Failed to stitch room screenshot tiles:', error)
      if (!cancelled) {
        onStitchError?.(t('editor.visualEditingFailedToStitch', 'Failed to stitch room preview.'))
      }
    })

    return () => {
      cancelled = true
    }
  }, [bundle, t, onStitchError])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated'
      }}
    />
  )
}
