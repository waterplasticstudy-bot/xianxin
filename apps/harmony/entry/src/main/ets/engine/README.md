# 手机 C 学习解释器

`LearningC.ts` is a real, offline teaching interpreter. Source is tokenized,
parsed into syntax nodes, and evaluated with fresh state for every call.
It does not compare source text with model answers, execute canned outputs,
use JavaScript eval/Function, run a shell, or expose host pointers.

## Public interface

```ts
const result = LearningC.run(sourceCode, testInput);
// CRunResult: status, output, diagnostic, steps
```

Statuses are `ok`, `compile_error`, `runtime_error`, `timeout`, `unsupported`.
Diagnostics carry source line and column. Output produced before a runtime
failure is preserved. A nonzero return from main is a runtime error. Each
test case must invoke `run` separately; no global variables/input cursor leak
between test cases.

## Supported teaching scope

- `int`, `unsigned int`, `char`, `unsigned char`, `void`, managed pointers;
  positive literal one-dimensional array lengths; scalar/array initialization.
- Local/global scopes, functions with named parameters, recursion, return;
  parameter values are copied while pointed-to cells can be changed.
- Blocks, if/else, for, while, do/while, break, continue; expression precedence,
  assignments, compound assignments, arithmetic, comparisons, logical short
  circuit, conditional expressions, bitwise operators and checked shifts.
- Address/dereference, pointer increments, pointer-to-pointer, array indexing,
  checked same-allocation pointer arithmetic; one-past pointers may be formed
  but cannot be dereferenced. Scope exit invalidates local memory.
- `printf`: d/i/u/x/X/o/c/s/%% with bounded literal widths, common flags and
  precision; `scanf`: d/u/c/s/%% with literal widths and assignment suppression.
  `puts`, `putchar`, `getchar`, `strlen`. Recognized headers: stdio.h, string.h.
- UTF-8 source string output (including Chinese); ASCII standard input,
  character constants, numeric character escapes and individual character output.

This is **not a complete C compiler**. Unsupported declarations, casts,
preprocessor macros/conditionals, floats, long/short, structs/unions, function
pointers, variable-length/multidimensional arrays, dynamic allocation, files,
system commands and network calls are explicitly rejected. Header recognition
provides only the implemented functions, not a full C standard library.
The evaluator is not a whole-program static type checker: some name/type
errors are reported when the statement executes. Undefined C programs
(e.g. multiple unsequenced modifications to the same variable) have no promised
C-compatible result and must not be used to infer real-compiler behavior.
Use the desktop GCC exercises for compiler validation and a development board
for hardware validation.

32-bit unsigned arithmetic wraps modulo 2^32; signed arithmetic overflow,
division by zero, invalid shifts, uninitialized reads, invalid pointers,
out-of-bounds access, and writes to string constants produce diagnostics.
Signed right shift follows arithmetic 32-bit shift; char narrowing uses 8-bit
two's-complement behavior. These implementation choices are not universal
properties of every C compiler or target.

## Resource bounds

| Resource | Limit |
| --- | ---: |
| Source text | 65,536 UTF-16 code units |
| Tokens | 16,000 |
| Parser nesting | 96 |
| Function frames | 48 |
| Evaluation nesting | 192 |
| Execution steps | 200,000 |
| One array | 4,096 cells |
| Total live managed memory | 32,768 cells |
| Standard input | 16,384 ASCII characters |
| Output | 32,768 UTF-16 code units |

Limits are enforced inside the parser/interpreter, so loops are bounded even
without a worker termination mechanism. No native pointer or OS interface is
available to student code. Running this bounded work off the UI thread remains
preferable for responsiveness.

## Verification

Run `tests/engine.test.cjs` with the independent AgentStack Node. It transpiles
the exact engine source with the installed SDK TypeScript, loads that trusted
module in a test VM, and submits student C only to `LearningC.run`. The suite
uses the original curriculum's **14 actual solutions / 44 test cases** plus
independent semantic and error cases. It tests wrong programs, invalid memory,
timeouts, output/resource limits, malformed syntax, and unavailable features.
The host suite does not establish phone runtime or hardware validation.

## Why not raw PicoC in the app process?

PicoC is a useful BSD-3-Clause embedded interpreter, but its array/pointer
implementation uses host addresses without bounds checks, and its stdio glue
passes interpreted pointers to native libc. A Worker or NAPI background thread
would not contain a native memory fault. See upstream
[expression.c](https://github.com/jpoirier/picoc/blob/master/expression.c),
[cstdlib/stdio.c](https://github.com/jpoirier/picoc/blob/master/cstdlib/stdio.c)
and [LICENSE](https://github.com/jpoirier/picoc/blob/master/LICENSE).

Huawei's native child process documentation describes device restrictions:
PC/2-in-1 and Tablet support does not establish phone support. API 26 provides
`OH_Ability_IsNativeChildProcessSupported()` for runtime capability checks.
The managed interpreter avoids making phone functionality depend on that
capability. [Huawei native child process reference](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/capi-native-child-process-h/)
