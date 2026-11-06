<?PHP
/** A docblock. */
#[Example(name: 'value')]
ENUM Result: string { case Ok = 'ok'; case Error = 'error'; }
FuNcTiOn process(?int $x, ...$rest): mixed {
    # A comment, but not an attribute.
    $class = new \App\Service\Worker();
    $$name = (int) 0xFF_FF + 0b1010 + 1.5e-2;
    ${$name} = true;
    return $x ?? match ($class->state) { Result::Ok => $rest[0], default => null };
}
// close tag ends this comment ?>
<strong>Outside again</strong>
