# Literals and ambiguous slash contexts
letter = 'λ'
newline = '\n'
message = "Hello #{user.name}!"
words = %w[red green blue]
symbols = %i[small medium large]
raw = %q(no #{expansion})
expanded = %Q(hello #{user.name})
name = :crystal
numbers = {0x2a_u8, 0b1010_i32, 0o755, 1_000_i64, 1.0_f32}
pattern = /a[bc]+#{suffix}/i
ratio = total / 2
half = total // 2

sql = <<-SQL
  SELECT * FROM users WHERE name = '#{name}'
  SQL
puts sql
