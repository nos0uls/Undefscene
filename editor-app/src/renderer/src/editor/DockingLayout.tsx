/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useState } from 'react'
import type { CSSProperties } from 'react'

import { DockPanel } from './DockPanel'
import { UpdateNotification } from './UpdateNotification'
import { useDockingContext } from './DockingContext'
import { useDocking } from './useDocking'
import { COLLAPSED_DOCK_SIZE } from './dockingConstants'

type DockingLayoutProps = React.PropsWithChildren<{
  renderPanelContents: (panelId: string) => React.JSX.Element
  getPanelTitle: (panelId: string) => string
  collapsePanelLabel: string
  closePanelLabel: string
  topBarContent: React.ReactNode
  centerContent: React.ReactNode
  isProjectLoading?: boolean
  loadingText?: string
}>

export function DockingLayout(props: DockingLayoutProps): React.JSX.Element {
  const {
    renderPanelContents,
    getPanelTitle,
    collapsePanelLabel,
    closePanelLabel,
    topBarContent,
    centerContent,
    isProjectLoading,
    loadingText,
    children
  } = props

  const ctx = useDockingContext()
  const {
    startPanelDrag,
    startResizeDrag,
    togglePanel,
    togglePanelCollapse,
    getVerticalDockRenderState,
    getDockedPanelStyle
  } = useDocking({ getPanelTitle, showDockDropPreview: true })

  const [activeBottomTabId, setActiveBottomTabId] = useState<string | null>(null)

  const { layout, collapsedDocks, setCollapsedDocks, drag } = ctx

  const leftTopGrow = layout.dockSizes.leftSplit
  const leftBottomGrow = Math.max(0.001, 1 - layout.dockSizes.leftSplit)
  const rightTopGrow = layout.dockSizes.rightSplit
  const rightBottomGrow = Math.max(0.001, 1 - layout.dockSizes.rightSplit)

  const leftDockedIds = layout.docked.left.filter((id) => layout.panels[id]?.mode === 'docked')
  const rightDockedIds = layout.docked.right.filter((id) => layout.panels[id]?.mode === 'docked')
  const bottomDockedIds = layout.docked.bottom.filter((id) => layout.panels[id]?.mode === 'docked')

  const leftDockRenderState = getVerticalDockRenderState([
    leftDockedIds[0]
      ? {
        id: leftDockedIds[0],
        className: ['dockPanelActions', drag?.panelId === leftDockedIds[0] ? 'isDragSource' : '']
          .filter(Boolean)
          .join(' '),
        baseStyle: {
          flexGrow: leftDockedIds.length >= 2 ? leftTopGrow : 1,
          flexBasis: 0,
          minHeight: 0
        }
      }
      : null,
    leftDockedIds[1]
      ? {
        id: leftDockedIds[1],
        className: ['dockPanelBookmarks', drag?.panelId === leftDockedIds[1] ? 'isDragSource' : '']
          .filter(Boolean)
          .join(' '),
        baseStyle: {
          flexGrow: leftDockedIds.length >= 2 ? leftBottomGrow : 1,
          flexBasis: 0,
          minHeight: 0
        }
      }
      : null
  ])

  const rightDockRenderState = getVerticalDockRenderState([
    rightDockedIds[0]
      ? {
        id: rightDockedIds[0],
        className: ['dockPanelText', drag?.panelId === rightDockedIds[0] ? 'isDragSource' : '']
          .filter(Boolean)
          .join(' '),
        baseStyle: {
          flexGrow: rightDockedIds.length >= 2 ? rightTopGrow : 1,
          flexBasis: 0,
          minHeight: 0
        }
      }
      : null,
    rightDockedIds[1]
      ? {
        id: rightDockedIds[1],
        className: ['dockPanelInspector', drag?.panelId === rightDockedIds[1] ? 'isDragSource' : '']
          .filter(Boolean)
          .join(' '),
        baseStyle: {
          flexGrow: rightDockedIds.length >= 2 ? rightBottomGrow : 1,
          flexBasis: 0,
          minHeight: 0
        }
      }
      : null
  ])

  const floatingPanelIds = Object.keys(layout.panels).filter(
    (id) => layout.panels[id]?.mode === 'floating'
  )

  return (
    <div
      ref={ctx.rootRef}
      tabIndex={-1}
      className="editorRoot"
      style={
        {
          ['--leftDockWidth' as string]: `${collapsedDocks.left ? COLLAPSED_DOCK_SIZE : layout.dockSizes.leftWidth}px`,
          ['--rightDockWidth' as string]: `${collapsedDocks.right ? COLLAPSED_DOCK_SIZE : layout.dockSizes.rightWidth}px`,
          ['--bottomDockHeight' as string]:
            bottomDockedIds.length > 0
              ? `${collapsedDocks.bottom ? COLLAPSED_DOCK_SIZE : layout.dockSizes.bottomHeight}px`
              : `${COLLAPSED_DOCK_SIZE}px`
        } as CSSProperties
      }
    >
      <UpdateNotification />

      {isProjectLoading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: 'var(--color-background-soft)',
              padding: '16px 24px',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              color: 'var(--ev-c-text-1)',
              fontSize: 14,
              fontWeight: 500
            }}
          >
            {loadingText}
          </div>
        </div>
      )}

      <header className="editorTopBar">
        {topBarContent}
      </header>

      <aside
        ref={ctx.leftDockRef}
        tabIndex={-1}
        className={['editorLeftDock', collapsedDocks.left ? 'isDockVisuallyCollapsed' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div ref={ctx.leftDockHitboxRef} className="dockDropHitbox dockDropHitboxLeft" aria-hidden="true" />
        <div
          className="dockCollapseBar dockCollapseBarLeft"
          onClick={() => setCollapsedDocks((prev) => ({ ...prev, left: !prev.left }))}
          title={collapsedDocks.left ? 'Expand left dock' : 'Collapse left dock'}
        >
          <span>{collapsedDocks.left ? '\u203A' : '\u2039'}</span>
        </div>
        <div ref={ctx.leftDockPreviewRef} className="dockDropPreview" aria-hidden="true" />
        <div className="dockCollapseContent">
          <div className="dockSlotSplit dockSlotSplitLeft">
            {leftDockRenderState.orderedEntries.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <DockPanel
                  title={getPanelTitle(entry.id)}
                  className={entry.className}
                  style={getDockedPanelStyle(entry.id, entry.baseStyle, {
                    fillRemainingSpace: leftDockRenderState.fillRemainingPanelId === entry.id
                  })}
                  onHeaderPointerDown={startPanelDrag(entry.id)}
                  collapsed={layout.panels[entry.id]?.collapsed}
                  onToggleCollapse={() => togglePanelCollapse(entry.id)}
                  collapseLabel={collapsePanelLabel}
                  closeLabel={closePanelLabel}
                  onClose={() => togglePanel(entry.id)}
                >
                  {renderPanelContents(entry.id)}
                </DockPanel>
                {leftDockRenderState.showSplitter && index === 0 ? (
                  <div
                    className="internalSplitter"
                    aria-hidden="true"
                    onPointerDown={startResizeDrag('split-left')}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </div>
      </aside>

      <main className="editorCenter">
        {centerContent}
      </main>

      <aside
        ref={ctx.rightDockRef}
        tabIndex={-1}
        className={['editorRightDock', collapsedDocks.right ? 'isDockVisuallyCollapsed' : '']
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div ref={ctx.rightDockHitboxRef} className="dockDropHitbox dockDropHitboxRight" aria-hidden="true" />
        <div
          className="dockCollapseBar dockCollapseBarRight"
          onClick={() => setCollapsedDocks((prev) => ({ ...prev, right: !prev.right }))}
          title={collapsedDocks.right ? 'Expand right dock' : 'Collapse right dock'}
        >
          <span>{collapsedDocks.right ? '\u2039' : '\u203A'}</span>
        </div>
        <div ref={ctx.rightDockPreviewRef} className="dockDropPreview" aria-hidden="true" />
        <div className="dockCollapseContent">
          <div className="dockSlotSplit dockSlotSplitRight">
            {rightDockRenderState.orderedEntries.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <DockPanel
                  title={getPanelTitle(entry.id)}
                  className={entry.className}
                  style={getDockedPanelStyle(entry.id, entry.baseStyle, {
                    fillRemainingSpace: rightDockRenderState.fillRemainingPanelId === entry.id
                  })}
                  onHeaderPointerDown={startPanelDrag(entry.id)}
                  collapsed={layout.panels[entry.id]?.collapsed}
                  onToggleCollapse={() => togglePanelCollapse(entry.id)}
                  collapseLabel={collapsePanelLabel}
                  closeLabel={closePanelLabel}
                  onClose={() => togglePanel(entry.id)}
                >
                  {renderPanelContents(entry.id)}
                </DockPanel>
                {rightDockRenderState.showSplitter && index === 0 ? (
                  <div
                    className="internalSplitter"
                    aria-hidden="true"
                    onPointerDown={startResizeDrag('split-right')}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </div>
      </aside>

      <section
        ref={ctx.bottomDockRef}
        tabIndex={-1}
        className={[
          'editorBottomDock',
          collapsedDocks.bottom ? 'isDockVisuallyCollapsed' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div ref={ctx.bottomDockHitboxRef} className="dockDropHitbox dockDropHitboxBottom" aria-hidden="true" />
        {bottomDockedIds.length > 0 ? (
          <div
            className="dockCollapseBar dockCollapseBarBottom"
            onClick={() => setCollapsedDocks((prev) => ({ ...prev, bottom: !prev.bottom }))}
            title={collapsedDocks.bottom ? 'Expand bottom dock' : 'Collapse bottom dock'}
          >
            <span>{collapsedDocks.bottom ? '\u25B4' : '\u25BE'}</span>
          </div>
        ) : null}
        <div ref={ctx.bottomDockPreviewRef} className="dockDropPreview" aria-hidden="true" />
        <div className="dockCollapseContent">
          {bottomDockedIds.length > 0
            ? (() => {
              const activeId =
                activeBottomTabId && bottomDockedIds.includes(activeBottomTabId)
                  ? activeBottomTabId
                  : bottomDockedIds[0]

              return (
                <>
                  {bottomDockedIds.length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 0,
                        borderBottom: '1px solid var(--ev-c-gray-3)',
                        background: 'var(--color-background-soft)',
                        flexShrink: 0
                      }}
                    >
                      {bottomDockedIds.map((panelId) => (
                        <div
                          key={panelId}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'stretch',
                            background:
                              panelId === activeId ? 'var(--color-background)' : 'var(--color-background-soft)',
                            borderBottom:
                              panelId === activeId
                                ? '2px solid var(--ev-c-accent)'
                                : '2px solid transparent'
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveBottomTabId(panelId)}
                            onPointerDown={(e) => {
                              if (e.button === 0 && e.detail >= 2) return
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '4px 8px',
                              fontSize: 11,
                              fontWeight: panelId === activeId ? 700 : 400,
                              color:
                                panelId === activeId ? 'var(--ev-c-text-1)' : 'var(--ev-c-text-2)',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'color 0.12s, background 0.12s',
                              textAlign: 'left'
                            }}
                          >
                            {getPanelTitle(panelId)}
                          </button>
                          <button
                            type="button"
                            aria-label={closePanelLabel}
                            title={closePanelLabel}
                            onClick={() => togglePanel(panelId)}
                            style={{
                              width: 28,
                              border: 'none',
                              borderLeft: '1px solid var(--ev-c-gray-3)',
                              background: 'transparent',
                              color: 'var(--ev-c-text-2)',
                              cursor: 'pointer'
                            }}
                          >
                            {'\u2715'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <DockPanel
                    title={getPanelTitle(activeId)}
                    className={['dockPanelLogs', drag?.panelId === activeId ? 'isDragSource' : '']
                      .filter(Boolean)
                      .join(' ')}
                    style={getDockedPanelStyle(activeId)}
                    onHeaderPointerDown={startPanelDrag(activeId)}
                    collapsed={layout.panels[activeId]?.collapsed}
                    onToggleCollapse={() => togglePanelCollapse(activeId)}
                    collapseLabel={collapsePanelLabel}
                    closeLabel={closePanelLabel}
                    onClose={() => togglePanel(activeId)}
                  >
                    {renderPanelContents(activeId)}
                  </DockPanel>
                </>
              )
            })()
            : null}
        </div>
      </section>

      <div className="floatingLayer" aria-hidden={drag ? 'true' : 'false'}>
        {floatingPanelIds.map((panelId) => {
          const p = layout.panels[panelId]
          if (!p || p.mode !== 'floating' || !p.position || !p.size) return null

          if (drag?.panelId === panelId) return null

          return (
            <div
              key={panelId}
              className="floatingPanel"
              style={{
                left: `${p.position.x}px`,
                top: `${p.position.y}px`,
                width: `${p.size.width}px`,
                height: `${p.size.height}px`,
                zIndex: p.zIndex
              }}
            >
              <DockPanel
                title={getPanelTitle(panelId)}
                className="isFloating"
                onHeaderPointerDown={startPanelDrag(panelId)}
                collapsed={p.collapsed}
                onToggleCollapse={() => togglePanelCollapse(panelId)}
                collapseLabel={collapsePanelLabel}
                closeLabel={closePanelLabel}
                onClose={() => togglePanel(panelId)}
              >
                {renderPanelContents(panelId)}
              </DockPanel>
              <div
                className="floatingResizeZone resize-n"
                onPointerDown={startResizeDrag('float-n', panelId)}
              />
              <div
                className="floatingResizeZone resize-s"
                onPointerDown={startResizeDrag('float-s', panelId)}
              />
              <div
                className="floatingResizeZone resize-e"
                onPointerDown={startResizeDrag('float-e', panelId)}
              />
              <div
                className="floatingResizeZone resize-w"
                onPointerDown={startResizeDrag('float-w', panelId)}
              />
              <div
                className="floatingResizeZone resize-ne"
                onPointerDown={startResizeDrag('float-ne', panelId)}
              />
              <div
                className="floatingResizeZone resize-nw"
                onPointerDown={startResizeDrag('float-nw', panelId)}
              />
              <div
                className="floatingResizeZone resize-se"
                onPointerDown={startResizeDrag('float-se', panelId)}
              />
              <div
                className="floatingResizeZone resize-sw"
                onPointerDown={startResizeDrag('float-sw', panelId)}
              />
            </div>
          )
        })}

        <div
          ref={ctx.ghostRef}
          className="dragGhost"
          style={{
            display: 'none',
            width: drag ? `${drag.size.width}px` : undefined,
            height: drag ? `${drag.size.height}px` : undefined
          }}
        >
          <div className="dragGhostHeader">
            {drag ? getPanelTitle(drag.panelId) : ''}
          </div>
        </div>
      </div>

      <div
        className="dockSplitter dockSplitterVertical dockSplitterLeft"
        onPointerDown={startResizeDrag('dock-left')}
      />
      <div
        className="dockSplitter dockSplitterVertical dockSplitterRight"
        onPointerDown={startResizeDrag('dock-right')}
      />
      <div
        className="dockSplitter dockSplitterHorizontal dockSplitterBottom"
        onPointerDown={startResizeDrag('dock-bottom')}
      />

      {children}
    </div>
  )
}
