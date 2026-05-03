import { createContext, useContext, useEffect, useMemo, useRef } from 'react'

type BranchCallback = (parallelStartId: string) => void

type NodeActionsValue = {
  addBranchRef: React.MutableRefObject<BranchCallback | null>
  removeBranchRef: React.MutableRefObject<BranchCallback | null>
}

const NodeActionsContext = createContext<NodeActionsValue>({
  addBranchRef: { current: null },
  removeBranchRef: { current: null }
})

export function NodeActionsProvider({
  children,
  addBranch,
  removeBranch
}: {
  children: React.ReactNode
  addBranch: BranchCallback
  removeBranch: BranchCallback
}): React.JSX.Element {
  const addBranchRef = useRef(addBranch)
  const removeBranchRef = useRef(removeBranch)

  useEffect(() => {
    addBranchRef.current = addBranch
    removeBranchRef.current = removeBranch
  }, [addBranch, removeBranch])

  const value = useMemo(() => ({ addBranchRef, removeBranchRef }), [])

  return (
    <NodeActionsContext.Provider value={value}>
      {children}
    </NodeActionsContext.Provider>
  )
}

export function useNodeActionsRef(): NodeActionsValue {
  const ctx = useContext(NodeActionsContext)
  if (!ctx) throw new Error('useNodeActionsRef must be inside NodeActionsProvider')
  return ctx
}
