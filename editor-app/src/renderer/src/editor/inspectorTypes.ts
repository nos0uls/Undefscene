// Состояние модалки, которая появляется, когда имя ноды уже занято.
// Вынесено в отдельный файл, чтобы InspectorPanel и EditorShell могли его импортировать.
export type NameConflictModalState = {
  nodeId: string
  previousName: string
  conflictingWithNodeId: string
  value: string
}
