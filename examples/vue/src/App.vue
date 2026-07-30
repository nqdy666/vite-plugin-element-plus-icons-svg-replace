<script setup lang="ts">
import {
  ArrowDownBold,
  ArrowUp,
  ArrowUpBold,
  ArrowDown as MyArrowDown,
  Search,
} from '@element-plus/icons-vue'
import { ref } from 'vue'

const dropdownValue = ref('')
const dropdownOptions = [
  { label: '选项一', value: '1' },
  { label: '选项二', value: '2' },
  { label: '选项三', value: '3' },
]

function handleSelect(val: string) {
  dropdownValue.value = val
}
</script>

<template>
  <div style="padding: 20px; font-family: Arial, sans-serif;">
    <h2>EP Icons SVG Replace Demo</h2>

    <p>
      下拉选择：
    </p>
    <el-select
      v-model="dropdownValue"
      placeholder="请选择"
      style="width: 200px; margin-bottom: 20px;"
      @change="handleSelect"
    >
      <el-option
        v-for="item in dropdownOptions"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      />
    </el-select>
    <p v-if="dropdownValue">
      当前选中值：{{ dropdownValue }}
    </p>

    <p>ArrowDown icon (replaced):</p>
    <MyArrowDown width="24" />
    <p>ArrowUp icon (replaced):</p>
    <ArrowUp width="24" />
    <p>ArrowDownBold icon (replaced):</p>
    <ArrowDownBold width="24" />
    <p>ArrowUpBold icon (replaced):</p>
    <ArrowUpBold width="24" />
    <p>Search icon (original):</p>
    <Search width="24" />
  </div>
</template>
