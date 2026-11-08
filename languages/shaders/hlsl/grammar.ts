import {
  byte,
  bytes,
  choice,
  literal,
  lookahead,
  notNext,
  on,
  paint,
  popState,
  pushState,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";
import { c, type CExtension } from "#/languages/systems/c/grammar.ts";
import { cppExtension } from "#/languages/systems/cpp/grammar.ts";

const hlslExtension: CExtension = (base) => {
  const { digit, upper, start, rest, ident } = base;
  const cpp = cppExtension(base);
  return {
    ...cpp,
    name: "hlsl",
    aliases: undefined,
    aggregateHead: "aggregateHead",
    keywords: (keywords) => {
      cpp.keywords?.(keywords);
      keywords.push(
        ...`
          in out inout uniform groupshared precise nointerpolation linear centroid sample
          noperspective row_major column_major globallycoherent cbuffer tbuffer discard shared
          snorm unorm
        `
          .trim()
          .split(/\s+/),
      );
    },
    types: (types) => {
      cpp.types?.(types);
      const scalars = `
        bool int uint dword half float double min16float min10float min16int min12int min16uint
        int16_t uint16_t int32_t uint32_t int64_t uint64_t float16_t float32_t float64_t
      `
        .trim()
        .split(/\s+/);
      types.push(
        ...scalars.filter((type) => !types.includes(type)),
        ...scalars.flatMap((type) =>
          [1, 2, 3, 4].flatMap((n) => [
            `${type}${n}`,
            ...[1, 2, 3, 4].map((m) => `${type}${n}x${m}`),
          ]),
        ),
      );
      types.push(
        ...`
          vector matrix Texture1D Texture1DArray Texture2D Texture2DArray Texture2DMS
          Texture2DMSArray Texture3D TextureCube TextureCubeArray RWTexture1D RWTexture1DArray
          RWTexture2D RWTexture2DArray RWTexture3D Buffer RWBuffer StructuredBuffer
          RWStructuredBuffer AppendStructuredBuffer ConsumeStructuredBuffer ByteAddressBuffer
          RWByteAddressBuffer ConstantBuffer SamplerState SamplerComparisonState
          RasterizerOrderedBuffer RasterizerOrderedByteAddressBuffer
          RasterizerOrderedStructuredBuffer RasterizerOrderedTexture1D
          RasterizerOrderedTexture1DArray RasterizerOrderedTexture2D
          RasterizerOrderedTexture2DArray RasterizerOrderedTexture3D
          RaytracingAccelerationStructure
        `
          .trim()
          .split(/\s+/),
      );
    },
    beforeStrings: [
      ...(cpp.beforeStrings ?? []),
      on(
        "[",
        literal("["),
        lookahead(
          bytes(" \t", { min: 0 }),
          choice(
            ...`
              numthreads unroll loop branch flatten fastopt allow_uav_condition shader
              maxvertexcount domain partitioning outputtopology outputcontrolpoints
              patchconstantfunc earlydepthstencil wavesize
            `
              .trim()
              .split(/\s+/)
              .map((word) => [literal(word)]),
          ),
          notNext(rest),
        ),
        paint("punctuation.bracket"),
        pushState("hlslAttribute"),
      ),
    ],
    beforeOperators: [
      on(
        ":",
        literal(":"),
        notNext(":"),
        lookahead(
          bytes(" \t", { min: 0 }),
          choice(
            [literal("SV_"), bytes(rest)],
            [byte(upper), bytes(union(upper, digit, "_"), { min: 0 }), notNext(rest)],
          ),
        ),
        paint("operator"),
        pushState("hlslSemantic"),
      ),
    ],
    states: (code) => ({
      hlslSemantic: {
        style: "plain" as const,
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          on(start, ...ident, paint("attribute"), popState()),
        ],
        otherwise: [popState()],
      },
      hlslAttribute: {
        style: "plain" as const,
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          on(start, ...ident, paint("attribute"), setState("hlslAttributeBody")),
        ],
        otherwise: [popState()],
      },
      hlslAttributeBody: {
        style: "plain" as const,
        arms: [token("]", "punctuation.bracket", popState()), ...code],
      },
      ...cpp.states?.(code),
    }),
  };
};

export default {
  ...c(hlslExtension),
  extensions: ["hlsl", "hlsli", "fx", "fxh"],
};
