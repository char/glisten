import { bytes, choice, literal, lookahead, notNext, on, paint, pushState } from "#/grammar/mod.ts";
import { c, type CExtension } from "#/languages/systems/c/grammar.ts";

const glslExtension: CExtension = ({ rest, ident }) => ({
  name: "glsl",
  aliases: ["vert", "frag"],
  keywords: (keywords) => {
    keywords.push(
      ..."in out inout uniform buffer shared layout flat smooth noperspective highp mediump lowp precision invariant centroid sample patch coherent readonly writeonly subroutine attribute varying precise discard".split(
        " ",
      ),
    );
  },
  types: (types) => {
    types.push(
      "uint",
      "atomic_uint",
      ...["vec", "ivec", "uvec", "bvec", "dvec"].flatMap((prefix) =>
        [2, 3, 4].map((n) => `${prefix}${n}`),
      ),
      ...["mat", "dmat"].flatMap((prefix) =>
        [2, 3, 4].flatMap((n) => [`${prefix}${n}`, ...[2, 3, 4].map((m) => `${prefix}${n}x${m}`)]),
      ),
      ...["", "i", "u"].flatMap((prefix) =>
        [
          "1D",
          "2D",
          "3D",
          "Cube",
          "2DRect",
          "1DArray",
          "2DArray",
          "CubeArray",
          "Buffer",
          "2DMS",
          "2DMSArray",
        ].flatMap((dim) => [`${prefix}sampler${dim}`, `${prefix}image${dim}`]),
      ),
      ...["1D", "2D", "Cube", "2DRect", "1DArray", "2DArray", "CubeArray"].map(
        (dim) => `sampler${dim}Shadow`,
      ),
      "samplerExternalOES",
    );
  },
  constants: ["true", "false"],
  beforeIdentifiers: [
    on(
      "ub",
      choice([literal("uniform")], [literal("buffer")]),
      notNext(rest),
      lookahead(bytes(" \t\r\n"), ...ident, bytes(" \t\r\n", { min: 0 }), literal("{")),
      paint("keyword"),
      pushState("aggregateHead"),
    ),
    on("g", literal("gl_"), bytes(rest, { min: 1 }), paint("variable")),
  ],
});

export default c(glslExtension);
