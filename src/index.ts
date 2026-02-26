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
        const json = JSON.parse(raw)
        if (Array.isArray(json)) {
          json.forEach((item: unknown) => {
            const it = item as { name?: string, d?: string }
            if (it?.name && it?.d) {
              replacements.push({ name: it.name, d: it.d })
            }
          })
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
  const safeD = d.replace(/'/g, '\\\'')
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
  const replacements: IconReplacement[] = []
  let projectRoot = process.cwd()

  return {
    name: pluginName,
    enforce: 'pre',
    configResolved(resolved: ResolvedConfig) {
      projectRoot = resolved.root || process.cwd()

      const configPath = _options.configPath
      if (configPath) {
        const loaded = loadConfigFromRoot(projectRoot, configPath)
        replacements.push(...loaded)

        if (_options.log !== false && replacements.length > 0) {
          console.warn(`[${pluginName}] Loaded ${replacements.length} icon replacements:`)
          replacements.forEach(r => console.warn(`  - ${r.name}`))
        }
      }

      if (replacements.length === 0 && _options.log !== false) {
        console.warn(`[${pluginName}] No icon replacements provided. Plugin will do nothing.`)
      }
    },
    resolveId(id) {
      if (id.startsWith('virtual:ep-icons-replace/')) {
        return id
      }

      return null
    },
    load(id) {
      if (!id.startsWith('virtual:ep-icons-replace/')) {
        return null
      }

      const iconName = path.basename(id)
      const replacement = replacements.find(r => r.name === iconName)

      if (!replacement) {
        return `export {}`
      }

      return generateReplacementModule(iconName, replacement.d)
    },
    transform(code, id) {
      if (!code || !id) {
        return null
      }

      if (!code.includes('@element-plus/icons-vue')) {
        return null
      }

      if (replacements.length === 0) {
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
        const names = (group1 || '').split(',').map(s => s.trim()).filter(Boolean)
        const replaced = names.filter(n => replacementNames.includes(n))
        const remaining = names.filter(n => !replacementNames.includes(n))

        const lines: string[] = []
        if (remaining.length > 0) {
          lines.push(`import { ${remaining.join(', ')} } from '@element-plus/icons-vue'`)
        }
        replaced.forEach((n) => {
          lines.push(`import ${n} from 'virtual:ep-icons-replace/${n}'`)
        })

        return lines.join('\n')
      })

      return { code: newCode, map: null }
    },
  }
}
