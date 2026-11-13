/**
 * Workspace context-menu row that opens the captured workspace directory in
 * VS Code. The row is plain data registered with the shared context menu, so
 * no component is mounted for the action itself; only its 14px glyph uses the
 * keyed `contextMenu.icon` slot.
 *
 * Availability and launching reuse the shipped open-in-app Host routes, which
 * already gate every request with the deployment's browser authentication and
 * verify that the named application is installed.
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
      },
    }
  },
})
