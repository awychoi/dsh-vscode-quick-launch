/**
 * Workspace-level affordances for the left sidebar and the Session header:
 *
 * - Open in VS Code, as a workspace context-menu row, a Session-header button
 *   immediately left of the overflow menu, or both;
 * - a color/pulse layer on each workspace folder glyph that rolls up the state
 *   of its sessions: red for a pending user decision, pulsing amber while any
 *   session (or one of its direct subagents) is working, and green while a
 *   finished session's completion is still unread.
 *
 * Each of the three parts can be switched off in Settings → General →
 * Workspace tools, persisted in localStorage for this browser. The VS Code
 * parts reuse the shipped open-in-app Host routes, so availability and
 * launching need no new Host surface. The tone layer reads the shipped Session
 * and Workspace snapshots through the standard slot hooks and paints the
 * existing folder glyph; it adds no session data of its own.
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
      'button.openVSCode': 'Open in VS Code',
      'toast.failed': 'Could not open VS Code',
      'settings.title': 'Workspace tools',
      'settings.description': 'Choose which parts of the workspace extension are active.',
      'settings.menu': 'Show "Open in VS Code" in the workspace menu',
      'settings.button': 'Show the "Open in VS Code" button in the session header',
      'settings.colors': 'Show workspace status colors',
    }
    const zh = {
      'action.openVSCode': '在 VS Code 中打开',
      'button.openVSCode': '在 VS Code 中打开',
      'toast.failed': '无法在 VS Code 中打开',
      'settings.title': '工作区工具',
      'settings.description': '选择要启用哪些工作区扩展功能。',
      'settings.menu': '在工作区菜单中显示“在 VS Code 中打开”',
      'settings.button': '在会话标题栏显示“在 VS Code 中打开”按钮',
      'settings.colors': '显示工作区状态颜色',
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

    // #region preferences
    const SETTINGS_KEY = 'dsh.workspace-open.settings.v1'
    const DEFAULT_SETTINGS = { menu: true, button: true, colors: true }

    /** @returns persisted switches, missing entries defaulting to on. */
    function readSettings() {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object') {
            return {
              menu: parsed.menu !== false,
              button: parsed.button !== false,
              colors: parsed.colors !== false,
            }
          }
        }
      } catch (_error) {
        // Storage disabled or corrupt: fall through to the defaults.
      }
      return { ...DEFAULT_SETTINGS }
    }

    let settings = readSettings()
    const settingsListeners = new Set()

    /** @returns current switches. */
    function getSettings() {
      return settings
    }

    /**
     * @param listener - called after every change.
     * @returns unsubscribe.
     */
    function subscribeSettings(listener) {
      settingsListeners.add(listener)
      return () => { settingsListeners.delete(listener) }
    }

    /** @param patch - switches to replace. */
    function updateSettings(patch) {
      settings = { ...settings, ...patch }
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch (_error) {
        // An unavailable storage keeps the choice for this page only.
      }
      for (const listener of settingsListeners) listener()
    }

    /** @returns the live switches for a component. */
    function useSettings() {
      const [value, setValue] = React.useState(getSettings)
      React.useEffect(() => subscribeSettings(() => { setValue(getSettings()) }), [])
      return value
    }
    // #endregion

    // #region open-in-app carrier
    // One availability read per page; a failed read retries on the next call
    // instead of hiding both controls for the rest of the session.
    let appsPromise
    /** @returns installed catalog ids, or an empty list when unavailable. */
    function loadApps() {
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

    let launching = false
    /**
     * Launch VS Code on one directory through the shipped Host route.
     * @param path - absolute workspace path.
     * @returns the handoff outcome; `busy` means a launch is already running.
     */
    async function launchVSCode(path) {
      if (launching) return 'busy'
      launching = true
      try {
        const response = await fetch(OPEN_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ app: APP_ID, path }),
        })
        return response.ok ? 'opened' : 'failed'
      } catch (_error) {
        return 'failed'
      } finally {
        launching = false
      }
    }
    // #endregion

    /** Theme palette colors shared with the Session status dots. */
    const TONE_COLOR = {
      attention: 'var(--dsw-alias-state-error-primary)',
      busy: 'var(--dsw-alias-state-warn-primary)',
      done: 'var(--dsw-alias-state-success-primary)',
    }
    const PULSE_NAME = 'dsh-workspace-open-busy-pulse'
    /** Workspace header rows carry `workspace:<workspaceId>`; ungrouped is empty. */
    const WORKSPACE_ROW_SELECTOR = '[data-row-key^="workspace:"]'
    const WORKSPACE_ROW_PREFIX = 'workspace:'
    const EMPTY_TONES = new Map()

    /** Shared stylesheet: the busy pulse, the header button, and the settings row. */
    const STYLES = `
@keyframes ${PULSE_NAME}{0%,100%{opacity:1}50%{opacity:.45}}
.dsh-workspace-open-header-button{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-workspace-open-header-button:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
@media (hover:hover){.dsh-workspace-open-header-button:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}}
.dsh-workspace-open-row{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dsh-workspace-open-row-head{display:flex;flex-direction:column;gap:4px}
.dsh-workspace-open-row-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-workspace-open-row-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-workspace-open-options{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.dsh-workspace-open-option{display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer}
.dsh-workspace-open-option-label{font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dsh-workspace-open-switch{appearance:none;-webkit-appearance:none;flex:none;position:relative;width:34px;height:20px;margin:0;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;transition:background 120ms ease}
.dsh-workspace-open-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform 120ms ease}
.dsh-workspace-open-switch:checked{background:var(--dsw-alias-brand-primary)}
.dsh-workspace-open-switch:checked::after{transform:translateX(14px);background:var(--dsw-alias-bg-base)}
.dsh-workspace-open-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
`

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
        const animation = tone === 'busy' && animated ? `${PULSE_NAME} 1.6s ease-in-out infinite` : ''
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
     * @param props - image source and pixel size.
     */
    function AppIcon({ src, size }) {
      const [failed, setFailed] = React.useState(false)
      if (src === undefined || failed) {
        return h('svg', {
          viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true,
        }, h('path', {
          d: 'M9 3.5h3.5V7M12.5 3.5 8 8M6.5 4H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 13h6a1.5 1.5 0 0 0 1.5-1.5V9',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
          strokeLinecap: 'round', strokeLinejoin: 'round',
        }))
      }
      return h('img', {
        src, width: size, height: size, alt: '', draggable: false,
        onError: () => { setFailed(true) },
      })
    }

    /**
     * Context-menu icon: the action carries the icon source.
     * @param props - icon metadata captured with the resolved action.
     */
    function MenuIcon({ icon }) {
      return h(AppIcon, { src: icon?.src, size: 14 })
    }

    /**
     * Header entry that hides itself when the preference is off.
     * @param props - slot props.
     */
    function HeaderVSCodeEntry(props) {
      const settings = useSettings()
      return settings.button === true ? h(HeaderVSCodeButton, props) : null
    }

    /**
     * Session-header button: opens the Session's working directory in VS Code.
     * @param props - session seats, localized copy, and the launcher.
     */
    function HeaderVSCodeButton({ sessionId, useSessions, open, t }) {
      const cwd = useSessions(state => state.byId[sessionId]?.cwd)
      const [apps, setApps] = React.useState(undefined)
      React.useEffect(() => {
        let live = true
        void loadApps().then((list) => { if (live) setApps(list) })
        return () => { live = false }
      }, [])
      if (cwd === undefined || cwd === '' || apps === undefined || !apps.includes(APP_ID)) return null
      const label = t('button.openVSCode')
      return h('button', {
        type: 'button',
        className: 'dsh-workspace-open-header-button',
        'data-dsh-workspace-open': 'header-button',
        title: label,
        'aria-label': label,
        onClick: () => { void open(cwd) },
      }, h(AppIcon, { src: ICON_ROUTE, size: 15 }))
    }

    /**
     * Renderless frame-wide layer: computes the rollup whenever the Session,
     * status, or Workspace snapshots change, and repaints after the sidebar
     * mounts or replaces a header row.
     * @param props - standard slot hooks.
     */
    function TonePainter({ useWorkspaces, useSessions, useSessionStatus }) {
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

      return null
    }

    /**
     * Frame-wide seat that always carries the shared stylesheet and mounts the
     * tone painter only while the colors preference is on.
     * @param props - slot props.
     */
    function WorkspaceOverlay(props) {
      const settings = useSettings()
      const canPaint = props.useWorkspaces !== undefined
        && props.useSessions !== undefined
        && props.useSessionStatus !== undefined
      return h(React.Fragment, null,
        h('style', { 'data-dsh-workspace-open': 'styles' }, STYLES),
        settings.colors === true && canPaint ? h(TonePainter, props) : null,
      )
    }

    /**
     * One General-settings row with the three switches.
     * @param props - localized copy.
     */
    function WorkspaceSettingsRow({ t }) {
      const settings = useSettings()
      const option = (key, label) => h('label', { className: 'dsh-workspace-open-option' },
        h('span', { className: 'dsh-workspace-open-option-label' }, label),
        h('input', {
          type: 'checkbox',
          className: 'dsh-workspace-open-switch',
          checked: settings[key] === true,
          onChange: (event) => { updateSettings({ [key]: event.target.checked }) },
        }))
      return h('div', {
        className: 'dsh-workspace-open-row',
        'data-dsh-workspace-open': 'settings-row',
      },
      h('div', { className: 'dsh-workspace-open-row-head' },
        h('div', { className: 'dsh-workspace-open-row-title' }, t('settings.title')),
        h('div', { className: 'dsh-workspace-open-row-desc' }, t('settings.description'))),
      h('div', { className: 'dsh-workspace-open-options' },
        option('menu', t('settings.menu')),
        option('button', t('settings.button')),
        option('colors', t('settings.colors'))))
    }

    return {
      inject: ['contextMenus', 'locale', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'workspace-open: dictionaries')
        const t = ctx.locale.bind(NS)

        // Prefetch so the first menu opening does not wait on the catalog.
        void loadApps()

        const runVSCode = async (path) => {
          if (await launchVSCode(path) === 'failed') ctx.contextMenus.notify(t('toast.failed'), false)
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
            if (getSettings().menu !== true) return []
            const apps = await loadApps()
            if (!apps.includes(APP_ID)) return []
            return [{
              id: APP_ID,
              label: t('action.openVSCode'),
              icon: { key: 'workspace-open.application', src: ICON_ROUTE },
              run: () => runVSCode(path),
            }]
          },
        }), 'workspace-open: VS Code workspace action')

        // The header renders its overflow menu at order 0, so -1 puts the
        // button immediately to its left.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'workspace-open.vscode-button',
          order: -1,
          locale: NS,
          inject: () => ({ open: (path) => runVSCode(path) }),
        }, HeaderVSCodeEntry))

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'workspace-open',
          order: 50,
          locale: NS,
        }, WorkspaceSettingsRow))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'workspace-open.workspace-tone',
          order: 40,
        }, WorkspaceOverlay))
      },
    }
  },
})
