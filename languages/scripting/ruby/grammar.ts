import { ruby } from "./builder.ts";

export default {
  ...ruby("ruby"),
  extensions: ["rb", "rake", "gemspec", "ru"],
  filenames: [
    "Gemfile",
    "Rakefile",
    "Guardfile",
    "Vagrantfile",
    "Brewfile",
    "Podfile",
    "Fastfile",
    "Appfile",
    ".irbrc",
    ".pryrc",
  ],
};
