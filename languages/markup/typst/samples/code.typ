#import "utils.typ": render, theme
#include "chapter.typ"
#let dimensions = (12pt, 1em, 50%, 1fr, 45deg)
#let config = (enabled: true, color: none, margin: auto)
#let formula = $theta_2 + 1$
#if check((config[enabled])) { let x = 1 } else [Active *document*]; after the conditional.
#for item in (1, 2, 3) [Item #item.]; after the loop.
#while test((items[ready])) { update(items) }; after the while.
#show heading: make(
  [First *content*],
  [Second $alpha_1$],
); after the statement.
#lookup.field(1)[first][second #item].result and markup.
#lookup (not a call) [not a content argument].
#let body = {
  // Nested comments are legal.
  /* outer /* inner */ outer */
  let message = "Hello \u{1f44b}"
  if true { message } else { "no" }
}
