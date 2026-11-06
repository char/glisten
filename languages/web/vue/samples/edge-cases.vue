<template>
  <!-- attributes and text have different contexts -->
  <Widget :title="&quot;hello&quot; + name" @update:model-value.once="onUpdate($event)"
          v-bind:[dynamicKey].prop="value" #header="{ label }">
    {{ message }} <template #fallback><span>Empty</span></template>
  </Widget>
</template>
<script lang="jsx">
const view = <div>{value}</div>;
</script>
<docs lang="text">
Literal <tag> and {{ notAnExpression }}.
</docs>
<i18n lang="json">{"x":"a </not-i18n> b"}</i18n>
<style lang="unknown">$notCss: true;</style>
