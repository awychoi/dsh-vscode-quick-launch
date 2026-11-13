/**
 * Open in VS Code for the left sidebar and the Session header:
 *
 * - a workspace context-menu row (right-click or the row's "..." menu), and
 * - a Session-header button immediately left of the header's overflow menu.
 *
 * Each entry point can be switched off in Settings → General. Availability and
 * launching reuse the shipped open-in-app Host routes, so availability and
 * launching need no new Host surface or credential handling.
 */
window.__ModuleLoader__.load({
  id: 'dsh-vscode-quick-launch',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'vscodeQuickLaunch'
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
      'settings.title': 'VS Code Quick Launch',
      'settings.description': 'Choose where the Open in VS Code action appears.',
      'settings.menu': 'Show in the workspace menu',
      'settings.button': 'Show as a button in the session header',
    }
    const zh = {
      'action.openVSCode': '在 VS Code 中打开',
      'button.openVSCode': '在 VS Code 中打开',
      'toast.failed': '无法在 VS Code 中打开',
      'settings.title': 'VS Code 快速启动',
      'settings.description': '选择“在 VS Code 中打开”操作出现的位置。',
      'settings.menu': '在工作区菜单中显示',
      'settings.button': '在会话标题栏显示按钮',
    }

    // #region preferences
    const SETTINGS_KEY = 'dsh.vscode-quick-launch.settings.v1'
    /** The key written before the plugin was renamed. */
    const LEGACY_SETTINGS_KEY = 'dsh.workspace-open.settings.v1'
    const DEFAULT_SETTINGS = { menu: true, button: true }

    /** @returns persisted switches, missing entries defaulting to on. */
    function readSettings() {
      for (const key of [SETTINGS_KEY, LEGACY_SETTINGS_KEY]) {
        try {
          const raw = window.localStorage.getItem(key)
          if (raw === null) continue
          const parsed = JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object') {
            return {
              menu: parsed.menu !== false,
              button: parsed.button !== false,
            }
          }
        } catch (_error) {
          // Storage disabled or corrupt: try the next key, then the defaults.
        }
      }
      return { ...DEFAULT_SETTINGS }
    }

    let settings = readSettings()
    // Pin the value (including one migrated from the old key) so the previous
    // plugin identity cannot overwrite it later.
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch (_error) {
      // An unavailable storage keeps the choice for this page only.
    }
    const settingsListeners = new Set()
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

    /** Shared stylesheet: the header button and the settings row. */
    const STYLES = `
.dsh-vscode-quick-launch-header-button{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-vscode-quick-launch-header-button:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
@media (hover:hover){.dsh-vscode-quick-launch-header-button:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}}
.dsh-vscode-quick-launch-row{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dsh-vscode-quick-launch-row-head{display:flex;flex-direction:column;gap:4px}
.dsh-vscode-quick-launch-row-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-vscode-quick-launch-row-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-vscode-quick-launch-options{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.dsh-vscode-quick-launch-option{display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer}
.dsh-vscode-quick-launch-option-label{font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dsh-vscode-quick-launch-switch{appearance:none;-webkit-appearance:none;flex:none;position:relative;width:34px;height:20px;margin:0;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;transition:background 120ms ease}
.dsh-vscode-quick-launch-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform 120ms ease}
.dsh-vscode-quick-launch-switch:checked{background:var(--dsw-alias-brand-primary)}
.dsh-vscode-quick-launch-switch:checked::after{transform:translateX(14px);background:var(--dsw-alias-bg-base)}
.dsh-vscode-quick-launch-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
`

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
        className: 'dsh-vscode-quick-launch-header-button',
        'data-dsh-vscode-quick-launch': 'header-button',
        title: label,
        'aria-label': label,
        onClick: () => { void open(cwd) },
      }, h(AppIcon, { src: ICON_ROUTE, size: 15 }))
    }

    /**
     * Frame-wide seat carrying the shared stylesheet for the header button and
     * the settings row.
     * @returns the stylesheet.
     */
    function StylesLayer() {
      return h('style', { 'data-dsh-vscode-quick-launch': 'styles' }, STYLES)
    }

    /**
     * General-settings row with the two switches.
     * @param props - localized copy.
     */
    function WorkspaceSettingsRow({ t }) {
      const settings = useSettings()
      const option = (key, label) => h('label', { className: 'dsh-vscode-quick-launch-option' },
        h('span', { className: 'dsh-vscode-quick-launch-option-label' }, label),
        h('input', {
          type: 'checkbox',
          className: 'dsh-vscode-quick-launch-switch',
          checked: settings[key] === true,
          onChange: (event) => { updateSettings({ [key]: event.target.checked }) },
        }))
      return h('div', {
        className: 'dsh-vscode-quick-launch-row',
        'data-dsh-vscode-quick-launch': 'settings-row',
      },
      h('div', { className: 'dsh-vscode-quick-launch-row-head' },
        h('div', { className: 'dsh-vscode-quick-launch-row-title' }, t('settings.title')),
        h('div', { className: 'dsh-vscode-quick-launch-row-desc' }, t('settings.description'))),
      h('div', { className: 'dsh-vscode-quick-launch-options' },
        option('menu', t('settings.menu')),
        option('button', t('settings.button'))))
    }

    return {
      inject: ['contextMenus', 'locale', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'vscode-quick-launch: dictionaries')
        const t = ctx.locale.bind(NS)

        // Prefetch so the first menu opening does not wait on the catalog.
        void loadApps()

        const runVSCode = async (path) => {
          if (await launchVSCode(path) === 'failed') ctx.contextMenus.notify(t('toast.failed'), false)
        }

        ctx.slots.inject('contextMenu.icon', () => ctx.slots.register(
          { name: 'contextMenu.icon', key: 'vscode-quick-launch.application' },
          MenuIcon,
        ))

        ctx.effect(() => ctx.contextMenus.register({
          id: 'vscode-quick-launch.menu',
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
              icon: { key: 'vscode-quick-launch.application', src: ICON_ROUTE },
              run: () => runVSCode(path),
            }]
          },
        }), 'vscode-quick-launch: VS Code workspace action')

        // The header renders its overflow menu at order 0, so -1 puts the
        // button immediately to its left.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'vscode-quick-launch.header-button',
          order: -1,
          locale: NS,
          inject: () => ({ open: (path) => runVSCode(path) }),
        }, HeaderVSCodeEntry))

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'vscode-quick-launch',
          order: 50,
          locale: NS,
        }, WorkspaceSettingsRow))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'vscode-quick-launch.styles',
          order: 40,
        }, StylesLayer))
      },
    }
  },
})
