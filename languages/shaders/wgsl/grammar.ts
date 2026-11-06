import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  range,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const keywords =
  "alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if let loop override requires return struct switch true var while".split(
    " ",
  );
const types =
  "array atomic bool f16 f32 i32 u32 abstract_int abstract_float mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 mat2x2f mat2x3f mat2x4f mat3x2f mat3x3f mat3x4f mat4x2f mat4x3f mat4x4f mat2x2h mat2x3h mat2x4h mat3x2h mat3x3h mat3x4h mat4x2h mat4x3h mat4x4h ptr sampler sampler_comparison texture_1d texture_2d texture_2d_array texture_3d texture_cube texture_cube_array texture_depth_2d texture_depth_2d_array texture_depth_cube texture_depth_cube_array texture_depth_multisampled_2d texture_external texture_multisampled_2d texture_storage_1d texture_storage_2d texture_storage_2d_array texture_storage_3d vec2 vec3 vec4 vec2f vec3f vec4f vec2h vec3h vec4h vec2i vec3i vec4i vec2u vec3u vec4u".split(
    " ",
  );
const builtins =
  "abs acos acosh all any arrayLength asin asinh atan atanh atan2 ceil clamp cos cosh countLeadingZeros countOneBits countTrailingZeros cross degrees determinant distance dot exp exp2 extractBits faceForward firstLeadingBit firstTrailingBit floor fma fract frexp insertBits inverseSqrt ldexp length log log2 max min mix modf normalize pow quantizeToF16 radians reflect refract reverseBits round saturate select sign sin sinh smoothstep sqrt step tan tanh transpose trunc textureDimensions textureGather textureLoad textureNumLayers textureNumLevels textureNumSamples textureSample textureSampleBias textureSampleCompare textureSampleGrad textureSampleLevel textureStore workgroupBarrier storageBarrier atomicAdd atomicSub atomicLoad atomicStore atomicExchange atomicMax atomicMin atomicAnd atomicOr atomicXor atomicCompareExchangeWeak dpdx dpdy fwidth".split(
    " ",
  );
const cases = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(types, "type"),
  ...keywordTable(builtins, "function"),
  ...keywordTable(
    "function private workgroup uniform storage read write read_write".split(" "),
    "constant.builtin",
  ),
];
const number = on(
  ".0123456789",
  choice(
    [
      literal("0"),
      byte("xX"),
      bytes(hex),
      optional(literal("."), bytes(hex, { min: 0 })),
      optional(byte("pP"), optional(byte("+-")), bytes(digit)),
      optional(byte("iufh")),
    ],
    [
      choice(
        [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
        [literal("."), bytes(digit)],
      ),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
      optional(byte("iufh")),
    ],
  ),
  paint("number"),
);
const ident = [byte(start), bytes(rest, { min: 0 })] as const;
export default defineGrammar({
  name: "wgsl",
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on("@", literal("@"), ...ident, paint("attribute")),
        number,
        on("f", literal("fn"), notNext(rest), paint("keyword"), pushState("functionName")),
        on(
          "sa",
          choice([literal("struct")], [literal("alias")]),
          notNext(rest),
          paint("keyword"),
          pushState("typeName"),
        ),
        on(start, ...ident, classify(cases, [paint("variable")])),
        on("+-*/%=!<>&|^~", byte("+-*/%=!<>&|^~"), paint("operator")),
        on("(){}[]", byte("(){}[]"), paint("punctuation.bracket")),
        on(";,:.", byte(";,:."), paint("punctuation.delimiter")),
      ],
    },
    functionName: { style: "plain", arms: [on(start, ...ident, paint("function"), popState())] },
    typeName: { style: "plain", arms: [on(start, ...ident, paint("type"), popState())] },
    lineComment: {
      style: "comment",
      arms: [on("\r\n", byte("\r\n"), paint("comment"), popState())],
    },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
  },
});
