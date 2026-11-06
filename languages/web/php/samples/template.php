<!doctype html>
<html><body>
<h1 class="<?= htmlspecialchars($class) ?>"><?= $title ?></h1>
<?php if ($show) { ?>
<p>Welcome, <?= $name ?>!</p>
<?php } ?>
<?php
namespace App\View;
use App\Model\User;

#[Route('/users', methods: ['GET'])]
final readonly class Users {
    public function render(User $user): string {
        // Output uses the shared HTML document.
        return match ($user->status) {
            Status::Active => "Hello, {$user->name}!",
            default => 'Welcome',
        };
    }
}
?>
<p>After PHP</p>
</body></html>
