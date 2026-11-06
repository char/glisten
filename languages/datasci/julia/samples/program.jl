module Measurements
export summarize

"""
    summarize(xs)

Compute a simple summary, ignoring missing values.
"""
function summarize(xs::Vector{Float64})
    total = 0.0
    for x in xs
        total += x
    end
    return (total = total, last = xs[end])
end

struct Reading
    value::Float64
    name::String
end

end # module
