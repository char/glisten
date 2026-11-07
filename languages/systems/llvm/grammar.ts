import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const nameStart = union(range("a", "z"), range("A", "Z"), "-$._");
const name = union(nameStart, digit);
const wordStart = union(range("a", "z"), range("A", "Z"), "_");
const word = union(wordStart, digit, ".-");
const identifier = choice([byte(nameStart), bytes(name, { min: 0 })], [bytes(digit)]);
const types =
  "half bfloat float double fp128 x86_fp80 ppc_fp128 ptr void label metadata token x86_mmx x86_amx".split(
    " ",
  );
const constants =
  "true false null none undef poison zeroinitializer blockaddress dso_local_equivalent no_cfi".split(
    " ",
  );
const keywords =
  `define declare global constant private internal available_externally linkonce weak common appending extern_weak linkonce_odr weak_odr external dso_local dso_preemptable dllimport dllexport default hidden protected alias ifunc any exactmatch largest nodeduplicate samesize localdynamic initialexec localexec unnamed_addr local_unnamed_addr thread_local externally_initialized addrspace section partition comdat align alignstack gc prefix prologue personality target datalayout triple source_filename module asm sideeffect inteldialect unwind attributes uselistorder uselistorder_bb type opaque to x vscale scalable distinct !llvm !DIExpression
ret br switch indirectbr invoke callbr resume catchswitch catchret cleanupret unreachable fneg add fadd sub fsub mul fmul udiv sdiv fdiv urem srem frem shl lshr ashr and or xor extractelement insertelement shufflevector extractvalue insertvalue alloca load store fence cmpxchg atomicrmw getelementptr trunc zext sext fptrunc fpext fptoui fptosi uitofp sitofp ptrtoint inttoptr bitcast addrspacecast icmp fcmp phi select freeze call va_arg landingpad catchpad cleanuppad
nsw nuw nusw exact inbounds inrange disjoint nneg samesign fast nnan ninf nsz arcp contract afn reassoc volatile atomic weak syncscope unordered monotonic acquire release acq_rel seq_cst singlethread
 eq ne ugt uge ult ule sgt sge slt sle oeq ogt oge olt ole one ord ueq une uno false true tail musttail notail fastcc coldcc ccc swiftcc preserve_mostcc preserve_allcc cxx_fast_tlscc anyregcc ghccc cc addrspace byval byref preallocated inalloca sret align dereferenceable dereferenceable_or_null noalias nocapture nofree nest returned nonnull noundef signext zeroext immarg readnone readonly writeonly argmemonly nounwind noinline alwaysinline inlinehint optnone optsize minsize noreturn willreturn mustprogress uwtable sanitize_address sanitize_memory sanitize_thread speculatable convergent noduplicate norecurse builtin nobuiltin cold hot naked nonlazybind returns_twice
amdgpu_kernel caller cleanup elementtype from memory nocallback nosync read readwrite spir_func ssp sspreq sspstrong swifttailcc vscale_range within write`
    .trim()
    .split(/\s+/)
    .filter((s) => !constants.includes(s));
const cases = [
  ...keywordTable(types, "type"),
  ...keywordTable(constants, "constant.builtin"),
  ...keywordTable([...new Set(keywords)], "keyword"),
];

export default defineGrammar({
  name: "llvm",
  aliases: ["ll"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token(";", "comment", pushState("comment")),
        on("c", literal('c"'), paint("string"), pushState("string")),
        token('"', "string", pushState("string")),
        // A global followed immediately by optional whitespace and '(' is a function;
        // indirect calls and globals separated from their argument list are ambiguous lexically.
        on(
          "@",
          literal("@"),
          identifier,
          lookahead(bytes(" \t", { min: 0 }), literal("(")),
          paint("function"),
        ),
        // Quoted global function names remain variables; their syntactic role is not tracked.
        on("@%", byte("@%"), literal('"'), paint("variable"), pushState("quotedIdentifier")),
        on("@%$", byte("@%$"), identifier, paint("variable")),
        on("!", literal("!"), identifier, paint("attribute")),
        token("!", "punctuation.special"),
        on("#", literal("#"), bytes(digit), paint("attribute")),
        // Bare names before ':' are labels lexically, including metadata field names.
        on(union(nameStart, digit), identifier, lookahead(literal(":")), paint("label")),
        // Width and numeric value bounds are left to the LLVM parser.
        on("i", literal("i"), bytes(digit), notNext(word), paint("type")),
        on(
          union(digit, "-"),
          optional(literal("-")),
          choice(
            [literal("0x"), optional(byte("KLMHR")), bytes(hex)],
            [
              bytes(digit),
              optional(literal("."), bytes(digit, { min: 0 })),
              optional(byte("eE"), optional(byte("+-")), bytes(digit)),
            ],
          ),
          notNext(word),
          paint("number"),
        ),
        on(wordStart, byte(wordStart), bytes(word, { min: 0 }), classify(cases, [paint("plain")])),
        token(oneOf("()[]{}<>"), "punctuation.bracket"),
        token(oneOf(",:"), "punctuation.delimiter"),
        token(oneOf("=*"), "operator"),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    // Unterminated strings and quoted names continue through subsequent lines.
    string: {
      style: "string",
      arms: [
        on("\\", literal("\\"), byte(hex), byte(hex), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
    quotedIdentifier: {
      style: "variable",
      arms: [
        on("\\", literal("\\"), byte(hex), byte(hex), paint("string.escape")),
        token('"', "variable", popState()),
      ],
    },
  },
});
