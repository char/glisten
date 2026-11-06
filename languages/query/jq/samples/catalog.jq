# Build a summary from the input catalog.
def summary($title; selector):
  .items | map(select(selector)) | {
    title: $title,
    count: length,
    names: map(.name),
    ("by-\(.category)"): [.[].id]
  };

.items[] as $item
| if $item.enabled and ($item.price >= 1.5e2) then
    {name: $item.name, "quoted key": $item["sku"], fallback: (.description // "none")}
  elif $item.tags? then {tags: $item.tags}
  else empty end
| summary("Sale"; .count > 0)
