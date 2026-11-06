<script setup lang="tsx">
import { ref } from "vue";
const items = ref<string[]>(["a", "b"]);
const card = <strong>Ready</strong>;
</script>
<template>
  <ul>
    <template v-for="(item, index) in items" :key="item">
      <li v-if="index < 3" v-bind:[name].camel="item">{{ item as string }}</li>
    </template>
    <slot #default="{ item }" />
  </ul>
</template>
<style lang="scss" scoped>
$accent: #369;
ul { color: $accent; li { font-weight: bold; } }
</style>
