package Example::Widget;
use v5.38;
use strict;
use warnings;

sub render ($self, $name, $fh) {
    my @names = ($name, $_, $0, $@, $!, $/, $&);
    my %options = (title => $name, count => 0xFF_FF, flags => 0b1010);
    my $last = $#names;
    my $ref = ${$self->{name}};
    my @list = @{$self->{items}};
    my $value = $self->method($name) / 2;
    my $line = <$fh>;
    return "Hello, $name!";
}
1;
