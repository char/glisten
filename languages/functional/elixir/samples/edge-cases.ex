# Character, numbers, captures, and strings
pair = {0xFF_A0, 0o17, 0b1010, 12_345, 1.25e-3, ?a, ?\n, ?😀}
fun = &Enum.map/2
first = &1
bytes = <<1, 2::16>>
term = "outer #{inspect(%{key: {1, "inner #{2}"}})} tail"
escaped = "\x41 \u0062 \u{1F600}"
chars = 'charlist #{1 + 2}'
heredoc = '''
  interpolation: #{inspect(:ok)}
  '''
options = [do: :ok, label: :ready, active: true]
operators = left |> f() ++ right -- other =~ ~r/x/
