# vite-plugin-element-plus-icons-svg-replace

Replace Element Plus Icons SVG with custom SVG.

## Features

- Replace specific Element Plus icons with custom SVG path data
- Configuration via JSON array format (consistent with vite-plugin-ant-design-icons-svg-replace)
- Minimal intrusion; non-replaced icons remain unchanged

## Installation

```bash
npm install vite-plugin-element-plus-icons-svg-replace --save-dev
```

## Usage

### 1. Create Configuration File

Create a JSON file with icon replacements (e.g., `customEpIcon.json`):

```json
[
  {
    "name": "ArrowRight",
    "d": "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
  },
  {
    "name": "ArrowLeft",
    "d": "M14 6l-1.41-1.41L6.83 12l5.76 5.59L14 18l6-6z"
  }
]
```

### 2. Configure Vite

```typescript
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import VitePluginElementPlusIconsSvgReplace from 'vite-plugin-element-plus-icons-svg-replace'

export default defineConfig({
  plugins: [
    vue(),
    VitePluginElementPlusIconsSvgReplace({
      configPath: 'customEpIcon.json'
    })
  ]
})
```

### 3. Use Icons

```vue
<script setup lang="ts">
import { ArrowRight, Search } from '@element-plus/icons-vue'
</script>

<template>
  <!-- ArrowRight will be replaced with custom SVG -->
  <ArrowRight />
  <!-- Search will use the original Element Plus icon -->
  <Search />
</template>
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable` | `boolean` | `true` | Enable/disable the plugin |
| `log` | `boolean` | `true` | Show/hide plugin logs |
| `configPath` | `string` | - | Path to JSON configuration file |
| `replacements` | `IconReplacement[]` | `[]` | Inline replacements (optional) |

### IconReplacement

```typescript
interface IconReplacement {
  name: string // Icon name in PascalCase, e.g., 'ArrowRight'
  d: string // SVG path 'd' attribute data
}
```

## Configuration Format

The configuration must be a JSON array with objects containing `name` and `d` properties:

```json
[
  {
    "name": "IconName",
    "d": "SVG path data"
  }
]
```

- `name`: Icon component name in PascalCase (e.g., `ArrowRight`, `Search`)
- `d`: SVG path `d` attribute data

## License

MIT
