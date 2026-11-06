import {
  bytes,
  byteSet,
  choice,
  except,
  keywordTable,
  literal,
  lookahead,
  on,
  paint,
  popState,
  pushState,
  repeat,
  setState,
  token,
} from "#/grammar/mod.ts";
import { c, type CExtension } from "#/languages/systems/c/grammar.ts";
import { cppExtension } from "#/languages/systems/cpp/grammar.ts";

const cudaExtension: CExtension = (base) => {
  const cpp = cppExtension(base);
  const templateText = except(byteSet({ ranges: [[0, 255]] }), "<>\r\n");
  const templateBody = (depth: number): ReturnType<typeof repeat> =>
    repeat(
      choice(
        [bytes(templateText)],
        ...(depth ? [[literal("<"), templateBody(depth - 1), literal(">")]] : []),
      ),
    );
  return {
    ...cpp,
    name: "cuda",
    aliases: undefined,
    keywords: (words) => {
      cpp.keywords?.(words);
      words.push(
        ..."__global__ __device__ __host__ __shared__ __constant__ __managed__ __restrict__ __forceinline__ __launch_bounds__".split(
          " ",
        ),
      );
    },
    types: (words) => {
      cpp.types?.(words);
      words.push(
        "dim3",
        ..."char uchar short ushort int uint long ulong longlong ulonglong float double"
          .split(" ")
          .flatMap((name) => [1, 2, 3, 4].map((n) => `${name}${n}`)),
      );
    },
    wordCases: [
      ...(cpp.wordCases ?? []),
      ...keywordTable(
        ["threadIdx", "blockIdx", "blockDim", "gridDim", "warpSize"],
        "constant.builtin",
      ),
    ],
    beforeIdentifiers: [
      ...(cpp.beforeIdentifiers ?? []),
      on(
        base.start,
        ...base.ident,
        lookahead(
          bytes(" \t", { min: 0 }),
          literal("<"),
          templateBody(3),
          literal(">"),
          bytes(" \t", { min: 0 }),
          literal("<<<"),
        ),
        paint("function"),
        pushState("cudaTemplateHead"),
      ),
      on(
        base.start,
        ...base.ident,
        lookahead(bytes(" \t", { min: 0 }), literal("<<<")),
        paint("function"),
        pushState("cudaLaunchHead"),
      ),
    ],
    states: (code) => ({
      ...cpp.states?.(code),
      cudaTemplateHead: {
        style: "plain",
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token("<", "operator", setState("cudaTemplate")),
        ],
        otherwise: [popState()],
      },
      cudaTemplate: {
        style: "plain",
        arms: [
          on(
            ">",
            literal(">"),
            lookahead(bytes(" \t", { min: 0 }), literal("<<<")),
            paint("operator"),
            setState("cudaLaunchHead"),
          ),
          token("<", "operator", pushState("cudaTemplate")),
          token(">", "operator", popState()),
          ...code,
        ],
      },
      cudaLaunchHead: {
        style: "plain",
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token("<<<", "punctuation.bracket", setState("cudaLaunch")),
        ],
        otherwise: [popState()],
      },
      cudaLaunch: {
        style: "plain",
        arms: [
          token(">>>", "punctuation.bracket", popState()),
          token("(", "punctuation.bracket", pushState("cudaLaunchParen")),
          ...code,
        ],
      },
      cudaLaunchParen: {
        style: "plain",
        arms: [
          token(")", "punctuation.bracket", popState()),
          token("(", "punctuation.bracket", pushState("cudaLaunchParen")),
          ...code,
        ],
      },
    }),
  };
};

export default c(cudaExtension);
