import { test } from "avril:test";
import { compileLanguage } from "#/compiler/language.ts";
import { Highlighter } from "#/host/mod.ts";
import { assert, equal } from "#/testing/assert.ts";
import { buildModule } from "#/tools/module.ts";
import bash from "#/languages/shell/bash/grammar.ts";
import nix from "./grammar.ts";

const highlighter = new Highlighter({ checks: true });
for (const grammar of [nix, bash])
  await highlighter.add(new WebAssembly.Module(await buildModule(compileLanguage(grammar))));

function check(source: string, expected: Record<string, string>): void {
  const result = highlighter._process("nix", source);
  assert(result.status === "ok", `Highlighting failed: ${source}`);
  equal(result.missing, []);
  for (const [needle, style] of Object.entries(expected)) {
    const offset = source.indexOf(needle);
    assert(offset !== -1, `Missing test text: ${needle}`);
    const start = new TextEncoder().encode(source.slice(0, offset)).length;
    const end = start + new TextEncoder().encode(needle).length;
    const actual = new Set<string>();
    for (let i = 0, previous = 0; i < result.spans.length; i += 2) {
      const next = result.spans[i]!;
      if (previous < end && next > start) actual.add(highlighter.styles[result.spans[i + 1]!]!);
      previous = next;
    }
    assert(
      actual.size === 1 && actual.has(style),
      `${needle}: expected ${style}, got ${[...actual]} in ${source}`,
    );
  }
}

test("Nix injects Bash only in recognized shell bindings", () => {
  for (const attribute of [
    "shellHook",
    "buildPhase",
    "preBuild",
    "postInstall",
    "buildCommand",
    "preStart",
  ])
    for (const value of ["''echo $HOME''", '"echo $HOME"']) {
      for (const source of [
        `{ ${attribute} = ${value}; }`,
        `{ other = 1; ${attribute} = ${value}; after = true; }`,
        `let ${attribute} = ${value}; in null`,
        `let other = 1; ${attribute} = ${value}; in null`,
        `{ nested.${attribute} = ${value}; }`,
        `{ "${attribute}" = ${value}; }`,
        `{ nested."${attribute}" = ${value}; }`,
      ])
        check(source, { echo: "constant.builtin", $HOME: "variable" });
    }
  check("{ shellHook /* before */ = # after\n ''echo ok''; after = true; }", {
    echo: "constant.builtin",
    before: "comment",
    after: "comment",
    true: "constant.builtin",
  });
});

test("Nix ordinary strings and near shell names remain strings", () => {
  for (const attribute of [
    "description",
    "text",
    "script",
    "shellHookExtra",
    "mybuildPhase",
    "preBuilds",
  ])
    check(`{ ${attribute} = ''echo $HOME''; }`, { echo: "string", $HOME: "string" });
  for (const source of [
    "{ shellHook = value; description = ''echo plain''; }",
    "{ shellHook.extra = ''echo plain''; }",
    "let inherit shellHook; text = ''echo plain''; in text",
    "{ text = if shellHook == ''echo plain'' then true else false; }",
  ])
    check(source, { "echo plain": "string" });
});

test("Nix shell helpers distinguish names, attributes, and script bodies", () => {
  for (const helper of ["writeShellScript", "writeShellScriptBin"])
    check(`pkgs.${helper} "echo name" ''echo $HOME''`, {
      "echo name": "string",
      $HOME: "variable",
    });
  for (const helper of ["runCommand", "runCommandLocal", "runCommandCC"])
    check(`pkgs.${helper} "echo name" { description = ''echo text''; } ''printf $HOME''`, {
      "echo name": "string",
      "echo text": "string",
      printf: "constant.builtin",
      $HOME: "variable",
    });
  check('pkgs.writeShellScript /* name */ "greet" # body\n "echo \\"$HOME\\""', {
    echo: "constant.builtin",
    $HOME: "variable",
  });
  check("pkgs.writeShellApplication { text = ''echo $HOME''; name = \"echo name\"; }", {
    echo: "constant.builtin",
    $HOME: "variable",
    "echo name": "string",
  });
  check(
    "pkgs.writeShellApplication { name = \"greet\"; text = ''printf $HOME''; nested = { text = ''echo plain''; }; }",
    {
      printf: "constant.builtin",
      $HOME: "variable",
      "echo plain": "string",
    },
  );
  check("{ other = pkgs.writeText \"file\" ''echo plain''; text = ''echo ordinary''; }", {
    "echo plain": "string",
    "echo ordinary": "string",
  });
});

test("Nix interpolation preserves Bash quotes and nested Nix syntax", () => {
  check(
    '{ shellHook = \'\'echo "left ${if true then "🌙" else "night"} right $USER"\'\'; after = false; }',
    {
      echo: "constant.builtin",
      if: "keyword",
      true: "constant.builtin",
      "🌙": "string",
      right: "string",
      $USER: "variable",
      after: "variable.member",
      false: "constant.builtin",
    },
  );
  check("{ shellHook = ''echo \"${ { value = \"x\"; }.value } tail $HOME\"''; }", {
    value: "variable.member",
    "tail ": "string",
    $HOME: "variable",
  });
  check(
    "{ shellHook = ''echo \"${pkgs.writeShellScript \"inner\" ''printf nested''} outside $HOME\"''; }",
    {
      "printf nested": "string",
      outside: "string",
      $HOME: "variable",
    },
  );
});

test("Nix interpolation preserves Bash heredocs and comments", () => {
  check("{ buildPhase = ''cat <<EOF\nprefix ${name} $USER\nEOF\necho after\n''; }", {
    cat: "function",
    prefix: "string",
    name: "variable",
    $USER: "variable",
    echo: "constant.builtin",
  });
  check("{ shellHook = ''# before ${\nname\n} still comment\necho after''; }", {
    before: "comment",
    name: "variable",
    "still comment": "comment",
    echo: "constant.builtin",
  });
});

test("Nix escapes expose literal shell dollars and quotes to Bash", () => {
  check("{ shellHook = ''echo \"''${HOME}\"; printf \"'''quoted'''\"; echo done''; }", {
    HOME: "variable",
    quoted: "string",
    done: "plain",
  });
  check('{ shellHook = "echo \\"$HOME\\"; printf \\"done\\""; after = true; }', {
    $HOME: "variable",
    done: "string",
    after: "variable.member",
  });
});

test("Nix shell strings tolerate incomplete input and reset between documents", () => {
  check("{ shellHook = ''echo ${name", { echo: "constant.builtin", name: "variable" });
  check("{ shellHook = ''echo $HOME", { echo: "constant.builtin", $HOME: "variable" });
  check("{ description = ''echo ordinary''; }", { "echo ordinary": "string" });
});
