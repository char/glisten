# A small interactive helper
function greet --description 'Greet a visitor'
    if test (count $argv) -gt 0
        echo "Hello, $argv[1]!"
    else if set -q USER
        echo "Hello, $USER"
    else
        echo 'Hello, stranger'
    end
end

for item in alpha beta gamma
    switch $item
        case alpha
            greet $item
        case '*'
            continue
    end
end
