import { javascript } from "../javascript/grammar.ts";

export default {
  ...javascript({ types: true }),
  extensions: ["ts", "mts", "cts"],
};
