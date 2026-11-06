{ lib, pkgs, config, ... }:
let
  inherit (lib) mkIf mkOption types;
  cfg = config.services.sky;
  defaultPort = 8080;
  banner = "Observatory ${cfg.name}";
  paths = [ ./data ../shared ~/sky <nixpkgs> ];
in
{
  options.services.sky = {
    enable = mkOption {
      type = types.bool;
      default = false;
      description = "Enable the sky journal";
    };
    name = mkOption {
      type = types.str;
      default = "星空";
    };
  };

  config = mkIf cfg.enable {
    environment.systemPackages = [ pkgs.curl pkgs.jq ];
    services.sky.port = defaultPort;
    services.sky.url = https://example.test/sky?view=wide;
    services.sky.message = banner;
    services.sky.locations = paths ++ [ /var/lib/sky ];
    assertions = [ {
      assertion = cfg.name != "" && defaultPort > 0;
      message = "A name and positive port are required";
    } ];
  };
}
