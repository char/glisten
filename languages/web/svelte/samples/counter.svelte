<script lang="ts">
  let count = $state(0);
  const doubled = $derived(count * 2);
  function increment() { count += 1; }
</script>
<h1>Counter</h1>
<button onclick={increment} disabled={count > 10} class:active={count > 0}>
  Count: {count}; doubled: {doubled}
</button>
{#if count > 3}
  <p>Many clicks</p>
{:else if count > 0}
  <p>Getting started</p>
{:else}
  <p>No clicks yet</p>
{/if}
<style>
  button { color: rebeccapurple; }
</style>
