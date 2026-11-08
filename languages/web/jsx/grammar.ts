import { javascript } from "../javascript/grammar.ts";

export default {
  ...javascript({ jsx: true }),
  extensions: ["jsx"],
};
