# Styles

Grammars paint names from `grammar/styles.ts`. A module's manifest carries the tags and optional attributes for the styles it uses; the host registers them by name and renders tagged spans as `<g-TAG>`. `plain` has no element. Themes supply CSS; there is no automatic dotted-name fallback in HTML.

| Style                   | Tag  | Use                                              |
| ----------------------- | ---- | ------------------------------------------------ |
| `plain`                 | —    | Unstyled text and, by default, missing languages |
| `comment`               | `c`  | Comments                                         |
| `keyword`               | `k`  | Reserved words                                   |
| `type`                  | `t`  | Type names                                       |
| `tag`                   | `tg` | Markup element names                             |
| `attribute`             | `at` | Attribute names and CSS pseudo-classes           |
| `string`                | `s`  | Strings and delimiters                           |
| `string.escape`         | `se` | String escapes                                   |
| `number`                | `n`  | Numeric literals                                 |
| `constant.builtin`      | `cb` | Built-in constants                               |
| `constant.color`        | `co` | Color groups; `v` holds their text               |
| `variable`              | `v`  | Variables                                        |
| `variable.member`       | `vm` | Members and fields                               |
| `property`              | `pr` | Object keys                                      |
| `function`              | `f`  | Function names, in calls and definitions         |
| `operator`              | `o`  | Operators                                        |
| `punctuation.bracket`   | `pb` | Brackets                                         |
| `punctuation.delimiter` | `pd` | Separators and delimiters                        |
| `punctuation.special`   | `ps` | Interpolation and markup markers                 |
| `label`                 | `l`  | Delimiters and fence labels                      |
| `text.title`            | `tt` | Headings                                         |
| `text.strong`           | `ts` | Strong emphasis                                  |
| `text.emphasis`         | `em` | Emphasis                                         |
| `text.literal`          | `tl` | Literal text and code                            |
| `text.uri`              | `tu` | URLs and link destinations                       |
| `text.reference`        | `tr` | Link text and references                         |
| `text.strikethrough`    | `tx` | Strikethrough                                    |
| `error`                 | `er` | Known malformed input                            |
| `diff.plus`             | `da` | Added lines in diffs                             |
| `diff.minus`            | `dd` | Removed lines in diffs                           |

Groups wrap their contents in the group's tag. For a `constant.color` group, the host sets `v` to the escaped logical group text, even when the group is split across source segments. For example, a theme can use `g-co::before { background: attr(v type(<color>)); }`. Attribute values are attached to groups, not ordinary painted spans. See [the ABI](abi.md) for group composition.
