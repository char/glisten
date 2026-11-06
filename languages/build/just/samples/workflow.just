# Workspace defaults
set shell := ["bash", "-cu"]
export PROJECT := env("PROJECT", "orchard")
import? 'tasks.just'
mod tools 'tools.just'
alias b := build

[private]
[group('build')]
@build target='debug' +features: (prepare target) && notify
    @echo "building {{target}} for ${PROJECT}"
    cargo build --profile {{target}} {{features}}
    printf '%s\n' '{{{{literal braces}}'

prepare profile:
    mkdir -p "out/{{profile}}"

notify:
    echo done
