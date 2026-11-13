/**
 * Workspace-level affordances for the left sidebar:
 *
 * - a context-menu row that opens the captured workspace directory in VS Code
 *   (plain data; only its 14px glyph uses the keyed `contextMenu.icon` slot), and
 * - a color/pulse layer on each workspace folder glyph that rolls up the state
 *   of its sessions: red for a pending user decision, pulsing amber while any
 *   session (or one of its subagents) is working, and green while a finished
 *   session's completion is still unread.
 *
 * Availability and launching reuse the shipped open-in-app Host routes, which
 * already gate every request with the deployment's browser authentication and
 * verify that the named application is installed. The tone layer reads the
 * shipped Session and Workspace snapshots through the standard slot hooks and
 * paints the existing folder glyph; it adds no session data of its own.
 */
window.__ModuleLoader__.load({
  id: 'dsh-workspace-open',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'workspaceOpen'
    /** GET: catalog ids probed as installed on this Host. */
    const APPS_ROUTE = 'open-in-app/apps'
    /** POST: launch one installed application on one directory. */
    const OPEN_ROUTE = 'open-in-app/open'
    /** GET: the real application icon served by the Host. */
    const ICON_ROUTE = 'open-in-app/icon/vscode'
    const APP_ID = 'vscode'

    const en = {
      'action.openVSCode': 'Open in VS Code',
      'toast.failed': 'Could not open VS Code',
    }
    const zh = {
      'action.openVSCode': '在 VS Code 中打开',
      'toast.failed': '无法在 VS Code 中打开',
    }

    // #region workspace tone model
    /** Group key of the bucket for Sessions outside every Workspace. */
    const UNGROUPED_KEY = ''
    /** Higher wins when one Workspace holds Sessions in several states. */
    const TONE_RANK = { done: 1, busy: 2, attention: 3 }
    /** Pending interactions that wait on a person; others are background work. */
    const USER_ATTENTION_KINDS = new Set(['approval', 'plan-review', 'question'])

    /**
     * Count running direct subagent children per parent: Host-listed child
     * rows plus the loaded subagent catalog, deduplicated by child id.
     * @param list - Session list snapshot.
     * @param statuses - unified Session UI status by Session.
     * @returns running child count by parent Session id.
     */
    function runningSubagentCounts(list, statuses) {
      const children = new Map()
      const mark = (parentId, childId) => {
        let set = children.get(parentId)
        if (set === undefined) {
          set = new Set()
          children.set(parentId, set)
        }
        set.add(childId)
      }
      for (const row of Object.values(list.byId ?? {})) {
        if (row === undefined || row.origin !== 'subagent' || row.parentId === undefined) continue
        if ((statuses.get(row.id)?.running ?? row.running) === true) mark(row.parentId, row.id)
      }
      for (const [parentId, projection] of Object.entries(list.projectionsBySession ?? {})) {
        const catalog = projection?.values?.subagentCatalog
        if (!Array.isArray(catalog)) continue
        for (const entry of catalog) {
          if (entry.mode === 'external') continue
          if ((statuses.get(entry.id)?.running ?? list.byId?.[entry.id]?.running) === true) mark(parentId, entry.id)
        }
      }
      const counts = new Map()
      for (const [parentId, set] of children) counts.set(parentId, set.size)
      return counts
    }

    /**
     * Busiest tone per Workspace key (the ungrouped bucket uses `''`).
     * Archived, blank, and subagent Sessions do not speak for a Workspace;
     * subagent work reaches its parent through the running child count.
     * @param workspaces - Workspace snapshot with `items` and `archivedSessionIds`.
     * @param list - Session list snapshot.
     * @param statuses - unified Session UI status by Session.
     * @returns tone by Workspace key, omitted where the folder stays default.
     */
    function workspaceTones(workspaces, list, statuses) {
      const tones = new Map()
      const archived = new Set(workspaces?.archivedSessionIds ?? [])
      const counts = runningSubagentCounts(list, statuses)
      const membership = new Set()
      const consider = (key, sessionId) => {
        if (archived.has(sessionId)) return
        const row = list.byId?.[sessionId]
        if (row === undefined || row.blank === true || row.origin === 'subagent') return
        const status = statuses.get(sessionId)
        const pending = status?.pendingInteraction
        const attention = pending !== undefined && USER_ATTENTION_KINDS.has(pending.kind)
        const running = status?.running ?? row.running
        const busy = running === true || (counts.get(sessionId) ?? 0) > 0
        const tone = attention
          ? 'attention'
          : busy ? 'busy'
            : status?.completionUnread === true ? 'done' : undefined
        if (tone === undefined) return
        const previous = tones.get(key)
        if (previous === undefined || TONE_RANK[tone] > TONE_RANK[previous]) tones.set(key, tone)
      }
      for (const workspace of workspaces?.items ?? []) {
        for (const sessionId of workspace.sessionIds ?? []) {
          membership.add(sessionId)
          consider(String(workspace.workspaceId), sessionId)
        }
      }
      for (const sessionId of list.ids ?? []) {
        if (membership.has(sessionId)) continue
        consider(UNGROUPED_KEY, sessionId)
      }
      return tones
    }
    // #endregion

    /** Theme palette colors shared with the Session status dots. */
    const TONE_COLOR = {
      attention: 'var(--dsw-alias-state-error-primary)',
      busy: 'var(--dsw-alias-state-warn-primary)',
      done: 'var(--dsw-alias-state-success-primary)',
    }
    const PULSE_NAME = 'dsh-workspace-open-busy-pulse'
    const PULSE_CSS = `@keyframes ${PULSE_NAME}{0%,100%{opacity:1}50%{opacity:.45}}`
    const PULSE_ANIMATION = `${PULSE_NAME} 1.6s ease-in-out infinite`
    /** Workspace header rows carry `workspace:<workspaceId>`; ungrouped is empty. */
    const WORKSPACE_ROW_SELECTOR = '[data-row-key^="workspace:"]'
    const WORKSPACE_ROW_PREFIX = 'workspace:'
    const EMPTY_TONES = new Map()

    let reducedMotionQuery
    /** @returns true when the user asked the platform not to animate. */
    function prefersReducedMotion() {
      if (reducedMotionQuery === undefined) {
        reducedMotionQuery = typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)')
          : null
      }
      return reducedMotionQuery?.matches === true
    }

    /** @param row - workspace header row. @returns its 16px leading glyph cell. */
    function folderCell(row) {
      const cell = row.firstElementChild
      return cell === null || cell === undefined ? undefined : cell
    }

    /**
     * Paint the shipped folder glyph for each current row. Inline `color`
     * overrides the shipped `.slot` / `.folderActive` rules without touching
     * the icon, so the open/closed shape and the hover chevron stay intact.
     * @param tones - tone by Workspace key.
     */
    function applyWorkspaceTones(tones) {
      const animated = !prefersReducedMotion()
      for (const row of document.querySelectorAll(WORKSPACE_ROW_SELECTOR)) {
        const cell = folderCell(row)
        if (cell === undefined) continue
        const key = row.getAttribute('data-row-key')?.slice(WORKSPACE_ROW_PREFIX.length)
        const tone = key === undefined ? undefined : tones.get(key)
        if (tone === undefined) {
          if (row.hasAttribute('data-dsh-workspace-tone')) row.removeAttribute('data-dsh-workspace-tone')
        } else {
          row.setAttribute('data-dsh-workspace-tone', tone)
        }
        const color = tone === undefined ? '' : TONE_COLOR[tone]
        if (cell.style.color !== color) cell.style.color = color
        const animation = tone === 'busy' && animated ? PULSE_ANIMATION : ''
        if (cell.style.animation !== animation) cell.style.animation = animation
      }
    }

    /** Restore the shipped colors when the layer unloads. */
    function clearWorkspaceTones() {
      for (const row of document.querySelectorAll(WORKSPACE_ROW_SELECTOR)) {
        if (row.hasAttribute('data-dsh-workspace-tone')) row.removeAttribute('data-dsh-workspace-tone')
        const cell = folderCell(row)
        if (cell === undefined) continue
        cell.style.color = ''
        cell.style.animation = ''
      }
    }

    /**
     * The application's own icon with a neutral fallback, matching how the
     * shipped Open in menus present application artwork.
     * @param props - icon metadata captured with the resolved action.
     */
    function MenuIcon({ icon }) {
      const [failed, setFailed] = React.useState(false)
      const src = icon?.src
      if (src === undefined || failed) {
        return h('svg', {
          viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true,
        }, h('path', {
          d: 'M9 3.5h3.5V7M12.5 3.5 8 8M6.5 4H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 13h6a1.5 1.5 0 0 0 1.5-1.5V9',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
          strokeLinecap: 'round', strokeLinejoin: 'round',
        }))
      }
      return h('img', {
        src, width: 14, height: 14, alt: '', draggable: false,
        onError: () => { setFailed(true) },
      })
    }

    /**
     * Renderless frame-wide layer: recompute the rollup whenever the Session,
     * status, or Workspace snapshots change, and repaint after the sidebar
     * mounts or replaces a header row.
     * @param props - standard slot hooks.
     */
    function WorkspaceToneBody({ useWorkspaces, useSessions, useSessionStatus }) {
      const workspaces = useWorkspaces(state => state)
      const list = useSessions(state => state)
      const statuses = useSessionStatus(state => state)
      const latest = React.useRef(EMPTY_TONES)
      const tones = React.useMemo(
        () => workspaceTones(workspaces, list, statuses),
        [workspaces, list, statuses],
      )
      latest.current = tones

      React.useEffect(() => { applyWorkspaceTones(tones) }, [tones])

      React.useEffect(() => {
        // The sidebar can remount the list area on layout changes, so observe
        // the document and repaint only when a workspace row is added.
        const reapply = () => { applyWorkspaceTones(latest.current) }
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue
              if (node.matches?.(WORKSPACE_ROW_SELECTOR) === true
                || node.querySelector?.(WORKSPACE_ROW_SELECTOR) !== null) {
                reapply()
                return
              }
            }
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        reapply()
        return () => {
          observer.disconnect()
          clearWorkspaceTones()
        }
      }, [])

      return h('style', { 'data-dsh-workspace-open': 'tone' }, PULSE_CSS)
    }

    /**
     * Guard the rollup on the presence of the shipped snapshot hooks.
     * @param props - slot props.
     */
    function WorkspaceTone(props) {
      return props.useWorkspaces === undefined
        || props.useSessions === undefined
        || props.useSessionStatus === undefined
        ? null
        : h(WorkspaceToneBody, props)
    }

    return {
      inject: ['contextMenus', 'locale', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'workspace-open: dictionaries')
        const t = ctx.locale.bind(NS)

        // One availability read per page; a failed read retries on the next
        // opening instead of hiding the row for the rest of the session.
        let appsPromise
        const loadApps = () => {
          appsPromise ??= fetch(APPS_ROUTE, { headers: { accept: 'application/json' } })
            .then(response => (response.ok ? response.json() : { apps: [] }))
            .then(payload => (Array.isArray(payload.apps)
              ? payload.apps.filter(id => typeof id === 'string') : []))
            .catch(() => {
              appsPromise = undefined
              return []
            })
          return appsPromise
        }
        // Prefetch so the first menu opening does not wait on the catalog.
        void loadApps()

        let launching = false
        const openInVSCode = async (path) => {
          if (launching) return
          launching = true
          try {
            const response = await fetch(OPEN_ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ app: APP_ID, path }),
            })
            if (!response.ok) throw new Error(`open failed: HTTP ${response.status}`)
          } catch (_error) {
            ctx.contextMenus.notify(t('toast.failed'), false)
          } finally {
            launching = false
          }
        }

        ctx.slots.inject('contextMenu.icon', () => ctx.slots.register(
          { name: 'contextMenu.icon', key: 'workspace-open.application' },
          MenuIcon,
        ))

        ctx.effect(() => ctx.contextMenus.register({
          id: 'workspace-open.vscode',
          target: 'workspace',
          // After the shipped Show in Finder row (200), before Delete (300).
          order: 220,
          resolve: async ({ path }) => {
            const apps = await loadApps()
            if (!apps.includes(APP_ID)) return []
            return [{
              id: APP_ID,
              label: t('action.openVSCode'),
              icon: { key: 'workspace-open.application', src: ICON_ROUTE },
              run: () => openInVSCode(path),
            }]
          },
        }), 'workspace-open: VS Code workspace action')

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'workspace-open.workspace-tone',
          order: 40,
        }, WorkspaceTone))
      },
    }
  },
})
