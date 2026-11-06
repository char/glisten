base := env("ROOT", "/tmp")
output := if os() == "linux" { base / 'release' } else { base / "other" }
pattern := if arch() =~ "x86.*" { 'wide' } else { 'narrow' }
script := `printf '%s' hello`
description := '''
  A long note
  with more than one line.
'''
expanded := x'${HOME}/cache'

[confirm("Deploy now?")]
[linux]
deploy $TOKEN='test' *targets: build
    echo "deploy {{if TOKEN != '' { TOKEN } else { 'none' }}}"
    for host in {{targets}}; do echo "$host"; done
