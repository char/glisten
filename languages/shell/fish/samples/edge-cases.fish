# Quotes, escapes, and comment boundaries
echo 'it\'s \\ fine \q' "value: $HOME and \$literal"
echo prefix#suffix "$USER"#suffix $HOME#suffix # real comment
echo one\ two \#literal {$USER,guest} **/*.fish
echo $items[-1..2] $$indirect "$(string upper $USER)"
echo before(echo inner (pwd))after
function example -a input --description="sample"
    while test -n "$input"
        break
    end
    return 0
end
