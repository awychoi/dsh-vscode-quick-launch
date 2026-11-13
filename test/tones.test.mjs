/**
 * Behaviour checks for the tone rollup in client.js. The browser bundle is a
 * module-loader script, so the pure helpers are extracted from their marked
 * region and evaluated with Node built-ins only.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8')
const start = source.indexOf('// #region workspace tone model')
const end = source.indexOf('// #endregion')
assert.ok(start >= 0 && end > start, 'tone model region markers are present')
const { workspaceTones } = new Function(`'use strict'\n${source.slice(start, end)}\nreturn { workspaceTones }`)()

const workspace = (id, sessionIds) => ({ workspaceId: id, sessionIds })
const session = (id, extra = {}) => ({
  id, running: false, blank: false, origin: undefined, parentId: undefined, ...extra,
})

function statusesOf(entries) {
  return new Map(Object.entries(entries))
}

function run({ items, ids, byId, archived = [], projections = {}, statuses = {} }) {
  return workspaceTones(
    { items, archivedSessionIds: archived },
    { ids, byId, projectionsBySession: projections },
    statusesOf(statuses),
  )
}

// One running session paints its workspace busy.
assert.deepEqual(
  run({
    items: [workspace('w1', ['s1'])],
    ids: ['s1'],
    byId: { s1: session('s1', { running: true }) },
    statuses: { s1: { running: true } },
  }),
  new Map([['w1', 'busy']]),
)

// A pending decision outranks another session still running.
assert.deepEqual(
  run({
    items: [workspace('w1', ['s1', 's2'])],
    ids: ['s1', 's2'],
    byId: { s1: session('s1', { running: true }), s2: session('s2') },
    statuses: {
      s1: { running: true, completionUnread: false },
      s2: { running: false, completionUnread: false, pendingInteraction: { kind: 'question' } },
    },
  }),
  new Map([['w1', 'attention']]),
)

// An unread completion shows done, and reading it (no flag) returns to default.
assert.deepEqual(
  run({
    items: [workspace('w1', ['s1'])],
    ids: ['s1'],
    byId: { s1: session('s1') },
    statuses: { s1: { running: false, completionUnread: true } },
  }),
  new Map([['w1', 'done']]),
)
assert.equal(run({
  items: [workspace('w1', ['s1'])],
  ids: ['s1'],
  byId: { s1: session('s1') },
  statuses: { s1: { running: false, completionUnread: false } },
}).size, 0)

// Running wins over an older unread completion elsewhere in the workspace.
assert.deepEqual(
  run({
    items: [workspace('w1', ['s1', 's2'])],
    ids: ['s1', 's2'],
    byId: { s1: session('s1'), s2: session('s2', { running: true }) },
    statuses: {
      s1: { running: false, completionUnread: true },
      s2: { running: true, completionUnread: false },
    },
  }),
  new Map([['w1', 'busy']]),
)

// Archived sessions do not speak for the workspace.
assert.equal(run({
  items: [workspace('w1', ['s1'])],
  ids: ['s1'],
  byId: { s1: session('s1', { running: true }) },
  archived: ['s1'],
  statuses: { s1: { running: true } },
}).size, 0)

// A running direct subagent keeps its parent's workspace busy even when the
// parent itself is idle (the header subagent dropdown case).
assert.deepEqual(
  run({
    items: [workspace('w1', ['s1'])],
    ids: ['s1'],
    byId: { s1: session('s1') },
    projections: { s1: { values: { subagentCatalog: [{ id: 'c1', mode: 'continuable' }] } } },
    statuses: { s1: { running: false }, c1: { running: true } },
  }),
  new Map([['w1', 'busy']]),
)

// External tasks in the catalog never count as running.
assert.equal(run({
  items: [workspace('w1', ['s1'])],
  ids: ['s1'],
  byId: { s1: session('s1') },
  projections: { s1: { values: { subagentCatalog: [{ id: 'e1', mode: 'external' }] } } },
  statuses: { s1: { running: false }, e1: { running: true } },
}).size, 0)

// Sessions outside every workspace roll up under the ungrouped key; blank and
// subagent rows stay silent.
assert.deepEqual(
  run({
    items: [workspace('w1', ['s1'])],
    ids: ['s1', 'loose', 'blank', 'child'],
    byId: {
      s1: session('s1'),
      loose: session('loose', { running: true }),
      blank: session('blank', { blank: true }),
      child: session('child', { origin: 'subagent', parentId: 's1' }),
    },
    statuses: { loose: { running: true } },
  }),
  new Map([['', 'busy']]),
)

console.log('tone model: 9 checks passed')
