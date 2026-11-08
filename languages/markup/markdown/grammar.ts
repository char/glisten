import { ABI, type Manifest } from "#/abi/mod.ts";
import type { WatSource } from "#/compiler/language.ts";
import { module, wat } from "#/testing/wat/mod.ts";
import { blocks, embeds } from "./blocks.ts";
import { containerStack } from "./layout.ts";
import { manifestStyles } from "./styles.ts";
import { punctuationBytes } from "./unicode.ts";

const manifest: Manifest = {
  abi: ABI,
  language: "markdown",
  aliases: ["md"],
  embeds: Object.keys(embeds),
  styles: manifestStyles,
  styleMap: 0,
  areaBytes:
    containerStack.offset + containerStack.capacity * containerStack.frameBytes + punctuationBytes,
  maxDepth: 128,
};

const markdown: WatSource = {
  kind: "wat",
  build: () => ({
    manifest,
    wat: module({
      imports: [
        wat`(import "env" "memory" (memory 1))`,
        wat`(import "env" "base" (global $base i32))`,
      ],
      exports: [blocks()],
    }),
  }),
};

export default markdown;
