begin
    set -l files *.fish
    printf '%s\n' $files[1..2] | string upper >? output.txt
    command cat input.txt 2>&1 &| string match --regex 'warning'
    false; and echo skipped
    true && echo yes || echo no
    echo (string join , {red,green,blue}) $(pwd)
end
