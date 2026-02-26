import type { Plugin } from 'vite'

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

declare function VitePluginElementPlusIconsSvgReplace(
  options?: VitePluginElementPlusIconsSvgReplaceOptions,
): Plugin

export default VitePluginElementPlusIconsSvgReplace
