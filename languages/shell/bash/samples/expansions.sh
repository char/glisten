#!/usr/bin/env bash
# Strings, shell words, substitutions, and redirections.
name='Zoë'
greeting="Hello, $name: ${name^^}!"
literal='a $variable and a backslash \ stay literal'
printf '%s\n' "$greeting" "$literal"
printf '%s\n' $'first\nsecond\t\x41\u263a'
printf '%s\n' pre"$name"post escaped\ space \é

path=${PATH:-/usr/bin}
base=${path##*/}
short=${path%/*}
replacement=${name/o/ø}
indirect=HOME
printf '%s\n' "${!indirect}" "${name:0:2}" "${missing:=fallback}"
printf '%s\n' "${name:+present}" "${missing:?required}"

number=$((16#ff + 2 * (3 + 4)))
(( number += 1 ))
result=$(printf '%s' "$(printf '%s' nested)")
old=`printf '%s' legacy`
printf '%s %d\n' "$result" "$number" >output.txt 2>>errors.txt
printf '%s\n' "$old" |& sed 's/legacy/new/'
read -r first rest <<<"$greeting"
diff <(printf '%s\n' "$first") <(printf '%s\n' "$rest") || true

# Multiple pending documents have independent quoting rules.
cat <<FIRST <<'SECOND'
Hello $name, computed: $(printf '%s' "$base")
FIRST
No expansion: $name $(not-a-command) `nor-this`
SECOND

cat <<-TABBED
	Tabbed body: ${name:-friend}
	TABBED
cat <<E"N"D
Mixed quoting keeps $name literal.
END
printf 'done\n' # trailing comment

# A substitution can queue its own heredoc while another is pending.
cat <<OUT $(cat <<IN
inner $HOME
IN
)
outer ${HOME:-/tmp}
OUT
printf 'after nested heredocs\n'
printf '%s\n' $'\x4\x41\u263a\U0001f600\123\cA'
(( value = 64#_ + 2#10 ))
cat <<END $(printf x)
body
END
printf 'after substitution\n'
cat <<PIPE |
  sed 's/body/BODY/'
body
PIPE
printf 'after pipeline\n'
