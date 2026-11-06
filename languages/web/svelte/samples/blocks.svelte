<script module>
  export const title = "Tasks";
</script>
<script>
  let { items, promise } = $props();
</script>
{#snippet row(item, index)}
  <li title="Item {index}">{item.label}</li>
{/snippet}
<ul>
  {#each items as item, i (item.id)}
    {@render row(item, i)}
  {:else}
    <li>Nothing here</li>
  {/each}
</ul>
{#await promise}
  <p>Loading…</p>
{:then result}
  {@html result.html}
{:catch error}
  {@debug error}
{/await}
{#key items.length}<p>Updated</p>{/key}
