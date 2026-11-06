# dot-prefixed names, backticks, namespace, and user operators
.foo <- \(x, y = 0x1.8p+2) x %custom-op% y
`odd name` <- function(x) x$column + x@slot
other = function(z = NA_integer_) z
pkg:::hidden(.foo = .foo, .5, 1e-3i, NaN, Inf, T, F)
formula <- y ~ x + I(x^2)
result <- data.table::copy(tbl)[, .(a = 1L)]
if (TRUE && FALSE || !is.null(NULL)) { next } else { break }
