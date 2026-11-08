import { javascript } from "../javascript/grammar.ts";

export default {
  ...javascript({ types: true, jsx: true }),
  extensions: ["tsx"],
};
