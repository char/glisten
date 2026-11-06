# Examples in several languages

Each fenced block is highlighted in its own language.

```bash
#!/usr/bin/env bash
for name in "${names[@]}"; do
  printf 'hello %s\n' "$name"
done
```

```ts
interface Person { name: string; visits: number }
const greet = ({ name, visits }: Person): string =>
  `Hello, ${name}; visit ${visits + 1}`;
console.log(greet({ name: "Zoë", visits: 2 }));
```

```css
:root { --accent: #4a6; }
.card:hover {
  color: var(--accent);
  margin: 1.5rem 0;
}
```

```json
{
  "title": "Café",
  "enabled": true,
  "counts": [1, 2, null]
}
```

```rust
fn main() {
    let names = ["Ada", "雪"];
    for name in names {
        println!("Hello, {name}!");
    }
}
```

> A quoted fence:
> ~~~bash
> echo "quoted $HOME"
> ~~~

- A list containing code:

  ```ts
  const answer = 42;
  ```

```unknown
This remains plain: $HOME *not emphasis*
```
