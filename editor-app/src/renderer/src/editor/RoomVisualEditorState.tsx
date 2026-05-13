import { useCallback, useEffect, useState } from 'react'
import { createTranslator, type SupportedLanguage } from '../i18n'
import type { RoomScreenshotBundle } from './RoomVisualEditorTypes'

type RoomVisualEditorStateProps = {
  open: boolean
  screenshotRooms: string[]
  projectDir: string | null
  roomScreenshotsDir: string | null
  language: SupportedLanguage
  onRoomChange: (room: string) => void
}

export function useRoomVisualEditorState({
  open,
  screenshotRooms,
  projectDir,
  roomScreenshotsDir,
  language,
  onRoomChange
}: RoomVisualEditorStateProps) {
  const t = createTranslator(language)

  // Текущая выбранная room.
  const [selectedRoom, setSelectedRoom] = useState<string>('')

  // Загруженный screenshot bundle для выбранной room.
  const [bundle, setBundle] = useState<RoomScreenshotBundle | null>(null)

  // Простое состояние загрузки и ошибки, чтобы UI был понятнее.
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Счётчик ручного refresh. Увеличиваем его кнопкой Refresh.
  const [refreshToken, setRefreshToken] = useState(0)

  // В room picker показываем только комнаты с готовыми screenshot bundles.
  const availableRooms = screenshotRooms

  // Загружаем screenshot bundle для выбранной room.
  const refreshBundle = useCallback(async (): Promise<void> => {
    if (!open || !projectDir || !roomScreenshotsDir || !selectedRoom) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const result = await window.api.project.readRoomScreenshotBundle(
        projectDir,
        selectedRoom,
        roomScreenshotsDir
      )

      if (!result) {
        setBundle(null)
        setErrorMessage(
          t('editor.visualEditingFailedToLoad', 'Failed to load room screenshot data.')
        )
        return
      }

      setErrorMessage(null)
      setBundle(result)
    } catch (error) {
      console.warn('Failed to load room screenshot bundle:', error)
      setBundle(null)
      setErrorMessage(t('editor.visualEditingFailedToLoad', 'Failed to load room screenshot data.'))
    } finally {
      setIsLoading(false)
    }
  }, [open, projectDir, roomScreenshotsDir, selectedRoom, t])

  // Когда окно открылось и список screenshot rooms уже известен,
  // подставляем первую room по умолчанию, если текущая ещё невалидна.
  useEffect(() => {
    if (!open) return
    if (availableRooms.length <= 0) {
      setSelectedRoom('')
      onRoomChange('')
      return
    }

    if (!selectedRoom || !availableRooms.includes(selectedRoom)) {
      setSelectedRoom(availableRooms[0])
      onRoomChange(availableRooms[0])
    }
  }, [availableRooms, open, selectedRoom, onRoomChange])

  // Автозагрузка при открытии окна, смене room и ручном refresh.
  useEffect(() => {
    void refreshBundle()
  }, [refreshBundle, refreshToken])

  // Обработчик смены комнаты
  const handleRoomChange = useCallback(
    (room: string) => {
      setSelectedRoom(room)
      onRoomChange(room)
    },
    [onRoomChange]
  )

  // Обработчик refresh
  const handleRefresh = useCallback(() => {
    setRefreshToken((prev) => prev + 1)
  }, [])

  return {
    selectedRoom,
    bundle,
    isLoading,
    errorMessage,
    availableRooms,
    handleRoomChange,
    handleRefresh
  }
}
