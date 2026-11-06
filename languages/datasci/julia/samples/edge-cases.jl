#= Outer comment #= nested =# still outer =#
function Base.show(io::IO, x::Reading)
    print(io, "$(x.name): $(x.value)")
end
A = [1 2; 3 4]
lastvalue = A[end, end-1]
transposed = A' * A
ch = '\u2200'
vector = [ch, 'a', '\n']
∀ = 3
result = α≤β ? α⊗β : ∀
@show result
x = 0x1f + 0b1010 + 0o77 + 1.25f0 + 2x
z = :symbol
f.(vector)
broadcast = A .+ A
indices = 1:length(vector)
Base._setindex!(A, 1, 1)
