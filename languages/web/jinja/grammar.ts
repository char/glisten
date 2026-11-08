import { template } from "./builder.ts";

export default {
  ...template("jinja"),
  extensions: ["jinja", "jinja2", "j2"],
};
