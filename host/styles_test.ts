import { test } from "avril:test";
import { equal, throws } from "#/testing/assert.ts";
import { puppet } from "#/testing/puppet.ts";
import { Highlighter } from "./mod.ts";
import { Styles } from "./styles.ts";

test("first registration sets attributes together with tags", () => {
  const styles = new Styles();
  styles.id("color");
  equal(Array.from(styles.map([{ name: "color", tag: "co", attribute: "v" }])), [0]);
  styles.map([{ name: "color", tag: "other", attribute: "data-other" }]);
  equal(styles.tags, ["co"]);
  equal(styles.attributes, ["v"]);
  styles.map([{ name: "plain" }]);
  styles.map([{ name: "plain", tag: "p", attribute: "v" }]);
  equal(styles.tags[1], undefined);
  equal(styles.attributes[1], undefined);
});

test("style attributes must be lowercase ASCII names", () => {
  const styles = new Styles();
  styles.map([{ name: "color", tag: "co", attribute: "data-v2" }]);
  for (const attribute of ["", "V", "2v", "v x", 'v"', "é", "v\n"]) {
    throws(() => styles.map([{ name: "color", attribute }]), Error, /attribute/);
  }
});

test("adding a module rejects unsafe attributes even for a registered style", async () => {
  const host = new Highlighter();
  const info = {
    language: "color",
    aliases: [],
    embeds: [],
    styles: [{ name: "plain", attribute: 'v"' }],
    styleMap: 0,
    areaBytes: 2048,
  };
  const module = await puppet(info, []);
  try {
    await host.add(module);
    throw new Error("expected invalid attribute rejection");
  } catch (error) {
    if (!(error instanceof Error) || !/Invalid style attribute/.test(error.message)) throw error;
  }
});
