# Lexical edge cases

Not a heading: #inside or ####### too many markers.
An unmatched *asterisk, **strong opener, and `code opener.
An unmatched [link](destination and ![image](missing-title.

The underscores in snake_case_are_words stay literal.
But *a **nested** word* and ~~removed `code`~~ are formatted.
Single ~strike~; ~~double strike~~; ~~~not strike~~~.
Escapes: \[brackets\], \`ticks\`, \\ and \!; Unicode: naïve 雪.
A code span can contain a tick: `` `inside` `` and ` a  b `.
An unmatched `` opener should not swallow `a later span`.

A paragraph
with a lazy continuation in a quote follows:

> quoted *text
continued here* and [a link](https://example.org/a(b)c).
> - nested list
>   > nested quotation
>   > continued

A | B
--- | --- | ---
extra | delimiter | column

Title | not necessarily a table
===

[split definition]:
  /destination "title on the next line"

[three-line definition]:
  /another-destination
  "title on a separate line"

<div
class="multiline">
*HTML or markdown?*
</div>

<!-- An HTML comment
     with *literal* content -->

A fence longer than the apparent closer:

````bash
echo "three ticks don't close this"
```
echo "still inside"
````

A final unterminated fence:

~~~json
{"unfinished": [1, 2,
