use strict;
use warnings;
my $name = 'Ada';
print <<"ONE", <<'TWO', <<~THREE;
Hello $name
ONE
No $interpolation here.
TWO
  An indented $name
  THREE
print "after heredocs\n";

=head1 DOCUMENTATION

This is POD, not Perl code.

=cut

print "after POD\n";
__DATA__
This is data; $not_code is not a variable.
