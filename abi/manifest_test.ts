import { test } from "avril:test";
import { assert, equal, throws } from "#/testing/assert.ts";
import { ABI, AbiError, readManifest, validateStyleAttributes, type Manifest } from "./mod.ts";
import { manifestSection, validateManifest } from "./manifest.ts";

const header = [0, 97, 115, 109, 1, 0, 0, 0];
const manifest: Manifest = {
  abi: ABI,
  language: "x",
  aliases: [],
  embeds: [],
  styles: [{ name: "plain" }],
  styleMap: 0,
  areaBytes: 16,
  maxDepth: 4,
};

function load(value: Manifest): Manifest {
  return readManifest(
    new WebAssembly.Module(new Uint8Array([...header, ...manifestSection(value)])),
  );
}

test("manifest custom section round trips, including multibyte LEB sizes", () => {
  equal(load(manifest), manifest);
  const long = { ...manifest, language: "é".repeat(200) };
  equal(load(long), long);
});

test("missing manifest is an ABI error", () => {
  throws(
    () => readManifest(new WebAssembly.Module(new Uint8Array(header))),
    AbiError,
    /missing manifest/i,
  );
});

test("incompatible ABI is rejected", () => {
  throws(
    () => load({ ...manifest, abi: ABI - 1 }),
    AbiError,
    new RegExp(`module ABI ${ABI - 1}, host ${ABI}`),
  );
  throws(
    () => load({ ...manifest, abi: ABI + 1 }),
    AbiError,
    new RegExp(`module ABI ${ABI + 1}, host ${ABI}`),
  );
});

test("manifest schema accepts the expected fields", () => {
  assert(!validateManifest(manifest).errors);
});

test("manifest schema rejects missing and mistyped fields", () => {
  assert(validateManifest({ ...manifest, language: 1 }).errors);
  assert(validateManifest({ ...manifest, styles: ["plain"] }).errors);
  assert(validateManifest({ ...manifest, styles: [{ name: "keyword", tag: 3 }] }).errors);
  assert(validateManifest({ abi: ABI }).errors);
});

test("manifest attributes accept safe names and reject unsafe names", () => {
  const valid = { ...manifest, styles: [{ name: "color", tag: "co", attribute: "data-v2" }] };
  assert(!validateManifest(valid).errors);
  equal(load(valid), valid);
  validateStyleAttributes(valid.styles);
  for (const attribute of ["", "V", "2v", "v x", 'v"', "é", "v\n"])
    throws(() => validateStyleAttributes([{ name: "color", attribute }]), Error, /attribute/);
  assert(validateManifest({ ...manifest, styles: [{ name: "color", attribute: 42 }] }).errors);
});
