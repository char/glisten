#!/usr/bin/env bash
# Near misses are words, not keywords or builtins.
iffy thenable elsewhere fiftieth
printfx echoing casework esacape
command one#two # but this is a comment
A=1 PATH+=:/extra command arg
items=(alpha 'two words' "${HOME}")
items+=(more)
printf '%s\n' "${items[@]}" "${items[$((1 + 1))]}"

case "$1" in
  -m*=native) echo native ;;&
  *\|*) printf 'pipe\n' ;;
  *) echo other ;&
esac

# Delimiter-like lines do not close a heredoc.
cat <<EOF
EOF suffix
 EOF
continued \
EOF
actually the final delimiter follows
EOF
# An escaped delimiter is quoted after quote removal.
cat << E\OF
$HOME is literal here
EOF
cat <<é
Unicode delimiter, $HOME
é

# These final constructs are intentionally incomplete.
printf '%s\n' "${unfinished:-$(printf 'nested')}
