/**
 * Smoke checks for the browser bundle: the preference helpers the components
 * call must exist, and each registration keeps its id.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8')

for (const name of ['readSettings', 'getSettings', 'subscribeSettings', 'updateSettings', 'useSettings']) {
  assert.match(source, new RegExp(`function ${name}\\(`), `${name} is declared`)
}

for (const id of [
  'vscode-quick-launch.menu',
  'vscode-quick-launch.header-button',
  'vscode-quick-launch.styles',
  'vscode-quick-launch.application',
]) {
  assert.ok(source.includes(`'${id}'`), `${id} is registered`)
}
assert.ok(source.includes("name: 'settings.general.item',\n          id: 'vscode-quick-launch',"), 'settings row is registered')

console.log('bundle: helpers and registrations present')
