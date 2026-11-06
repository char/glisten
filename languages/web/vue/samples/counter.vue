<template>
  <section class="counter">
    <h1>{{ title }}</h1>
    <button :disabled="count >= limit" @click.prevent="increment()">{{ count }}</button>
    <p v-if="count > 0">Ready &amp; waiting</p>
  </section>
</template>
<script setup lang="ts">
import { ref } from "vue";
const title: string = "Counter";
const count = ref(0);
const limit = 5;
function increment() { count.value++; }
</script>
<style scoped>
.counter { display: grid; color: rebeccapurple; }
</style>
<i18n lang="json">
{"en": {"title": "Counter"}}
</i18n>
