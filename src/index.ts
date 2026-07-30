// vite-plugin-element-plus-icons-svg-replace
// Replace Element Plus Icons SVG with custom SVG via per-icon virtual modules
// Configuration: JSON array format like [{ name: "ArrowRight", d: "..." }, ...]

import type { Plugin, ResolvedConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

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

function generateReplacementModule(iconName: string, d: string): string {
  const safeD = d.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/'/g, '\\\'')
  return `import { defineComponent, h } from 'vue'

const ${iconName} = defineComponent({
  name: '${iconName}',
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 1024 1024',
    }, [
      h('path', { fill: 'currentColor', d: '${safeD}' })
    ])
  }
})

export default ${iconName}
`
}

export default function VitePluginElementPlusIconsSvgReplace(_options: VitePluginElementPlusIconsSvgReplaceOptions = {}): Plugin {
  const pluginName = 'vite-plugin-element-plus-icons-svg-replace'
  const PROXY_ID = '\0@element-plus/icons-vue-proxy'
  const replacements: IconReplacement[] = []
  let projectRoot = process.cwd()

  return {
    name: pluginName,
    enforce: 'post',
    config(config) {
      // Exclude @element-plus/icons-vue from dependency pre-bundling so that
      // our resolveId proxy module can intercept imports from Element Plus
      // internal components (e.g. el-select uses ArrowDown from @element-plus/icons-vue).
      // If pre-bundled, esbuild bypasses the plugin's resolveId hook.
      if (_options.enable !== false && (_options.replacements?.length || _options.configPath)) {
        const existing = config.optimizeDeps?.exclude
        const excludeList = existing
          ? (Array.isArray(existing) ? existing : [existing])
          : []
        if (!excludeList.includes('@element-plus/icons-vue')) {
          excludeList.push('@element-plus/icons-vue')
        }
        return {
          optimizeDeps: {
            ...config.optimizeDeps,
            exclude: excludeList,
          },
        }
      }
    },
    configResolved(resolved: ResolvedConfig) {
      if (_options.enable === false) {
        return
      }

      projectRoot = resolved.root || process.cwd()

      // Clear to avoid duplicates when configResolved fires multiple times
      replacements.length = 0

      // Merge inline replacements from options
      if (_options.replacements?.length) {
        replacements.push(..._options.replacements)
      }

      // Load replacements from config file
      const configPath = _options.configPath
      if (configPath) {
        const loaded = loadConfigFromRoot(projectRoot, configPath)
        replacements.push(...loaded)
      }

      if (_options.log !== false) {
        if (replacements.length > 0) {
          console.warn(`[${pluginName}] Loaded ${replacements.length} icon replacements:`)
          replacements.forEach(r => console.warn(`  - ${r.name}`))
        }
        else {
          console.warn(`[${pluginName}] No icon replacements provided. Plugin will do nothing.`)
        }
      }
    },
    resolveId(id, importer) {
      if (_options.enable === false || replacements.length === 0) {
        return null
      }

      // Intercept @element-plus/icons-vue with a proxy module.
      // Skip when importing from our own proxy to avoid infinite recursion.
      if (id === '@element-plus/icons-vue' && importer !== PROXY_ID) {
        return PROXY_ID
      }

      if (id.startsWith('virtual:ep-icons-replace/')) {
        return `\0${id}`
      }

      return null
    },
    load(id) {
      if (_options.enable === false || replacements.length === 0) {
        return null
      }

      // Proxy module: re-export replaced icons (take precedence) + original icons
      if (id === PROXY_ID) {
        const reExports = replacements
          .map(r => `export { default as ${r.name} } from 'virtual:ep-icons-replace/${r.name}'`)
          .join('\n')
        return `${reExports}\nexport * from '@element-plus/icons-vue'\n`
      }

      const resolvedId = id.replace(/^\0/, '')
      if (!resolvedId.startsWith('virtual:ep-icons-replace/')) {
        return null
      }

      const iconName = path.basename(resolvedId)
      const replacement = replacements.find(r => r.name === iconName)

      if (!replacement) {
        console.warn(`[${pluginName}] No replacement found for icon "${iconName}", skipping.`)
        return `export {}`
      }

      return generateReplacementModule(iconName, replacement.d)
    },
    transform(code, id) {
      if (_options.enable === false || replacements.length === 0) {
        return null
      }

      if (!id || !code.includes('@element-plus/icons-vue')) {
        return null
      }

      const replacementNames = replacements.map(r => r.name)
      const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@element-plus\/icons-vue['"]/g

      let newCode = code
      const matches = code.match(importRegex)
      if (!matches) {
        return null
      }

      newCode = newCode.replace(importRegex, (match, group1) => {
        const rawNames = (group1 || '').split(',').map(s => s.trim()).filter(Boolean)
        const parsed = rawNames.map((n) => {
          const parts = n.split(/\s+as\s+/)
          return { baseName: parts[0].trim(), alias: (parts[1] || parts[0]).trim() }
        })
        const replaced = parsed.filter(p => replacementNames.includes(p.baseName))
        const remaining = parsed.filter(p => !replacementNames.includes(p.baseName))

        const lines: string[] = []
        if (remaining.length > 0) {
          const remainingStr = remaining
            .map(p => p.baseName === p.alias ? p.baseName : `${p.baseName} as ${p.alias}`)
            .join(', ')
          lines.push(`import { ${remainingStr} } from '@element-plus/icons-vue'`)
        }
        replaced.forEach((p) => {
          lines.push(`import ${p.alias} from 'virtual:ep-icons-replace/${p.baseName}'`)
        })

        return lines.join('\n')
      })

      if (newCode === code) {
        return null
      }

      return { code: newCode }
    },
  }
}
