{ pkgs, name ? "sky", ... }:
let
  greeting = "Hello, ${name}!";
  quoted = "A \"bright\" night\\morning\n";
  literalDollar = "$$HOME";
  script = ''
    # This is Bash, not a Nix comment.
    echo "Hello ${name}"
    echo "Home: $HOME"
    echo "Literal: ''${HOME}"
    printf '%s\n' "''${items[@]}"
    printf '%s\n' "'''quoted'''"
    echo "Line break:''\nnext"
  '';
  nested = "${if name == "星" then "🌙" else "night"}";
  file = ./assets/${name}/image.png;
  absolute = /var/lib/sky/${name};
  home = ~/sky/notes;
  relative = ../shared/catalog.json;
  search = <nixpkgs/lib>;
  url = https://example.test/path?q=sky&lang=en;
  source = git+https://example.test/repo;
in
pkgs.writeShellScriptBin "observe" ''
  set -eu
  mkdir -p "$HOME/sky"
  echo ${greeting}
  echo ${nested}
  cat <<'EOF'
  雪 and stars
  EOF
  ${script}
''
