<script>
  let value = $state("");
  let props = { title: "hello" };
  const handle = () => console.log(value);
  $effect(() => console.log(value));
</script>
<input {value} {...props} bind:value on:input|once={handle} use:focus />
<div class:active={value} style:color={value} transition:fade|local in:fly out:fade animate:flip>
  {({ text: "}", nested: { n: 1 } }).text}
  {`value: ${value}`}
  {/}/.test(value) ? "brace" : "other"}
</div>
<style lang="scss">
  $accent: #369;
  div { color: $accent; &:hover { opacity: .8; } }
</style>
