import { delimited } from "../csv/grammar.ts";

export default {
  ...delimited("tsv", "\t", false),
  extensions: ["tsv", "tab"],
};
