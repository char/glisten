<?php
$name = 'single \'quoted\' and \\ slash';
$text = "Hello $name, $user->name, $items[0], {$user->profile['name']}, ${legacy}!\n";
$code = `echo $name`;
$body = <<<HTML
    <p>Hello, $name!</p>
    HTML;
$quoted = <<<"TEXT"
  {$user->name} with $items[0]
  TEXT;
$literal = <<<'RAW'
  $notInterpolated and \n stay literal
  RAW;
$next = 42;
