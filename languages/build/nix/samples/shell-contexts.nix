{ pkgs, name ? "world", ... }:
let
  message = "Hello, ${name}";
  script = pkgs.writeShellScript "greet" ''
    # Bash with Nix interpolation inside a quoted string.
    printf '%s\n' "${message}: $USER"
    printf '%s\n' "''${HOME}"
    echo "'''quoted'''"
  '';
  package = pkgs.runCommand "greeting" { description = "Not shell"; } ''
    mkdir -p "$out/bin"
    cp ${script} "$out/bin/greet"
  '';
in {
  shellHook = ''
    export GREETING="${message}"
    echo "$GREETING"
  '';
  buildPhase /* a Nix comment */ = ''
    for file in *.txt; do
      printf '%s\n' "$file"
    done
  '';
  nested.postInstall = "echo \"$out\"";
  "preCheck" = ''echo checking'';
  application = pkgs.writeShellApplication {
    name = "say-hello";
    text = ''
      echo "${if name == "world" then "Hello" else name}, $USER"
    '';
  };
  description = ''
    echo "$HOME" is ordinary text here.
  '';
  inherit package;
}
