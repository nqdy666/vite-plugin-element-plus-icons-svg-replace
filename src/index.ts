// vite-plugin-element-plus-icons-svg-replace
// Replace Element Plus Icons SVG with custom SVG via per-icon virtual modules
// Configuration: JSON array format like [{ name: "ArrowRight", d: "..." }, ...]
//
// Strategy (inspired by vite-plugin-ant-design-icons-svg-replace):
// - Inject esbuild/rolldown plugins into optimizeDeps to replace icons during pre-bundling
// - This avoids the need for optimizeDeps.exclude and works reliably across npm/pnpm/yarn
// - Vite resolveId/load hooks serve as fallback for dev server non-pre-bundled paths

import type { Plugin } from 'vite'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { normalizePath } from 'vite'

export interface IconReplacement {
  name: string
  d: string
}

export interface VitePluginElementPlusIconsSvgReplaceOptions {
  enable?: boolean
  log?: boolean
  replacements?: IconReplacement[]
  configPath?: string
}

/**
 * Detect Vite major version from the consuming project (not the plugin's own devDeps).
 * Fallback to 5 if detection fails.
 */
function getViteMajorVersion(): number {
  try {
    const projectRequire = createRequire(path.join(process.cwd(), 'noop.js'))
    return Number.parseInt(projectRequire('vite/package.json').version.split('.')[0])
  }
  catch {
    return 5
  }
}

function loadConfigFromRoot(rootDir: string, configPath?: string): IconReplacement[] {
  const replacements: IconReplacement[] = []
  if (configPath) {
    const abs = path.isAbsolute(configPath) ? configPath : path.resolve(rootDir, configPath)
    if (fs.existsSync(abs)) {
      try {
        const raw = fs.readFileSync(abs, 'utf8')
        const json: unknown = JSON.parse(raw)
        if (Array.isArray(json)) {
          for (const item of json) {
            if (typeof item === 'object' && item !== null && 'name' in item && 'd' in item) {
              const { name, d } = item as Record<string, unknown>
              if (typeof name === 'string' && typeof d === 'string') {
                replacements.push({ name, d })
              }
            }
          }
        }
        else {
          throw new TypeError('Config must be an array of { name, d } objects')
        }
      }
      catch (e) {
        console.error(`[vite-plugin-element-plus-icons-svg-replace] Failed to load config: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  return replacements
}

/**
 * Convert camelCase/PascalCase to snake_case.
 * e.g. ArrowDownBold -> arrow_down_bold
 */
function camelToSnake(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

/**
 * Generate replacement icon code compatible with @element-plus/icons-vue's
 * compiled barrel file format (using _defineComponent, _createElementVNode, etc.)
 */
function generateBarrelReplacementCode(iconName: string, d: string): string {
  const safeD = d.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, ' ')
  return `var ${iconName}_replacement = /* @__PURE__ */ _defineComponent({
  name: "${iconName}",
  setup(__props) {
    return (_ctx, _cache) => (_openBlock(), _createElementBlock("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 1024 1024"
    }, [
      _createElementVNode("path", {
        fill: "currentColor",
        d: "${safeD}"
      })
    ]));
  }
});`
}

/**
 * Apply icon replacements to the barrel file content.
 * Prepend replacement component definitions and modify export references.
 * Returns the modified content string.
 */
function applyReplacements(
  content: string,
  replacementMap: Map<string, IconReplacement>,
  log: boolean,
  pluginName: string,
  logPrefix: string,
  replaced?: Set<string>,
): string {
  for (const [iconName, replacement] of replacementMap) {
    const snakeName = camelToSnake(iconName)
    const varName = `${snakeName}_default`

    // Prepend the replacement component definition
    const replacementCode = generateBarrelReplacementCode(iconName, replacement.d)
    content = `${replacementCode}\n${content}`

    // Replace the export reference: arrow_down_default as ArrowDown -> ArrowDown_replacement as ArrowDown
    content = content.replace(
      new RegExp(`${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+as\\s+${iconName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
      `${iconName}_replacement as ${iconName}`,
    )

    if (log) {
      if (!replaced || !replaced.has(iconName)) {
        replaced?.add(iconName)
        console.warn(`[${pluginName}] (${logPrefix}) replaced ${iconName}`)
      }
    }
  }
  return content
}

// File path pattern for @element-plus/icons-vue barrel file (ESM entry)
// e.g. .../node_modules/@element-plus/icons-vue/dist/index.js
const EP_ICONS_BARREL_RE = /\/@element-plus\/icons-vue\/dist\/index\.js$/
// ----------------------------------------------------------------
// Rolldown plugin (Vite 7+)
// Injected into optimizeDeps.rolldownOptions.plugins to run during
// dependency pre-bundling. Directly intercepts the @element-plus/icons-vue
// barrel file and modifies its exports to use our replacement icons.
// ----------------------------------------------------------------
function createRolldownReplacePlugin(
  replacementMap: Map<string, IconReplacement>,
  log: boolean,
  pluginName: string,
) {
  const replaced = new Set<string>()

  return {
    name: `${pluginName}:rolldown`,
    load(id: string) {
      const normalized = normalizePath(id)
      if (!EP_ICONS_BARREL_RE.test(normalized))
        return null

      // Read the original barrel file
      let content = fs.readFileSync(id, 'utf-8')

      // Apply all icon replacements
      content = applyReplacements(content, replacementMap, log, pluginName, 'rolldown prebundle', replaced)

      return content
    },
  }
}

// ----------------------------------------------------------------
// Esbuild plugin (Vite 6)
// Injected into optimizeDeps.esbuildOptions.plugins. Directly intercepts
// the @element-plus/icons-vue barrel file and modifies its exports.
// ----------------------------------------------------------------
function createEsbuildReplacePlugin(
  replacementMap: Map<string, IconReplacement>,
  log: boolean,
  pluginName: string,
) {
  const replaced = new Set<string>()

  return {
    name: `${pluginName}:esbuild`,
    setup(build: any) {
      // Intercept the @element-plus/icons-vue barrel file and modify it
      build.onLoad(
        { filter: EP_ICONS_BARREL_RE },
        async (args: { path: string }) => {
          let content = await fs.promises.readFile(args.path, 'utf-8')

          // Apply all icon replacements
          content = applyReplacements(content, replacementMap, log, pluginName, 'esbuild prebundle', replaced)

          return { contents: content, loader: 'js' }
        },
      )
    },
  }
}

let i = 0

export default function VitePluginElementPlusIconsSvgReplace(_options: VitePluginElementPlusIconsSvgReplaceOptions = {}): Plugin {
  const pluginName = 'vite-plugin-element-plus-icons-svg-replace'

  // Build replacement map early so it's available to both config and load hooks
  const replacementMap = new Map<string, IconReplacement>()
  let initialized = false

  function initReplacements(): void {
    if (initialized)
      return
    initialized = true
    const hasReplacements = !!(_options.replacements?.length || _options.configPath)
    if (!hasReplacements)
      return

    if (_options.replacements) {
      for (const r of _options.replacements) {
        replacementMap.set(r.name, r)
      }
    }
    if (_options.configPath) {
      const configReplacements = loadConfigFromRoot(process.cwd(), _options.configPath)
      for (const r of configReplacements) {
        replacementMap.set(r.name, r)
      }
    }

    if (replacementMap.size > 0 && _options.log !== false) {
      console.warn(`[${pluginName}] Loaded ${replacementMap.size} icon replacements:`)
      replacementMap.forEach((_, name) => console.warn(`  - ${name}`))
    }
  }

  return {
    name: `${pluginName}:${i++}`,
    enforce: 'pre',
    config(config) {
      if (_options.enable === false)
        return

      initReplacements()
      if (replacementMap.size === 0)
        return

      const viteMajorVersion = getViteMajorVersion()
      if (_options.log !== false) {
        console.warn(`[${pluginName}] Detected Vite major version: ${viteMajorVersion}`)
      }

      if (viteMajorVersion >= 7) {
        const existingRolldownPlugins = config.optimizeDeps?.rolldownOptions?.plugins ?? []
        return {
          optimizeDeps: {
            ...config.optimizeDeps,
            rolldownOptions: {
              ...(config.optimizeDeps?.rolldownOptions ?? {}),
              plugins: [
                ...existingRolldownPlugins,
                createRolldownReplacePlugin(replacementMap, _options.log !== false, pluginName),
              ],
            },
          },
        }
      }

      const existingEsbuildPlugins = config.optimizeDeps?.esbuildOptions?.plugins ?? []
      return {
        optimizeDeps: {
          ...config.optimizeDeps,
          esbuildOptions: {
            ...(config.optimizeDeps?.esbuildOptions ?? {}),
            plugins: [
              ...existingEsbuildPlugins,
              createEsbuildReplacePlugin(replacementMap, _options.log !== false, pluginName),
            ],
          },
        },
      }
    },
    /**
     * load hook: intercepts the @element-plus/icons-vue barrel file during build.
     * In dev mode, optimizeDeps handles the replacement via the esbuild/rolldown
     * plugin injected above. During build, Rollup bundles directly and this load
     * hook is the primary interception point.
     */
    load(id) {
      if (_options.enable === false)
        return null
      initReplacements()
      if (replacementMap.size === 0)
        return null

      const normalized = normalizePath(id)
      if (!EP_ICONS_BARREL_RE.test(normalized))
        return null

      let content = fs.readFileSync(id, 'utf-8')

      // Apply all icon replacements
      content = applyReplacements(content, replacementMap, _options.log !== false, pluginName, 'load hook')

      return content
    },
  }
}
