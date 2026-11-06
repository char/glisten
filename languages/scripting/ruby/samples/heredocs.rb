left, right = <<~FIRST, <<-'SECOND'
  Hello #{name.upcase}
    FIRST
  literal #{name}
	SECOND
puts left, right

text = <<END_TEXT
#{items.map do |item|
  item.name
END_TEXT
puts "after"

=begin
Block comment
=end
__END__
not Ruby #{code}
