#' Summarize measurements
#' @param x A numeric vector.
#' @return A named summary.
summarize <- function(x, na.rm = TRUE) {
  cleaned <- x[!is.na(x)]
  if (length(cleaned) == 0L) return(NULL)
  result <- list(mean = mean(cleaned, na.rm = na.rm), n = length(cleaned))
  result$mean
}
values <- c(1L, 2.5, NA_real_, 0x1.fp3, 2i)
values |> summarize() |> print()
