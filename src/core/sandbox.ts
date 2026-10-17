import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten";
import variant from "@jitl/quickjs-singlefile-cjs-release-sync";
// Embedded WASM also works in the compiled executable. No host objects are exposed.
const QuickJS = await newQuickJSWASMModuleFromVariant(variant);
export function evaluateSandbox(
  code: string,
  globals: Record<string, unknown>,
  timeoutMs = 100,
  signal?: AbortSignal,
): unknown {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(
    () => signal?.aborted === true || Date.now() >= deadline,
  );
  const vm = runtime.newContext();
  try {
    const source = `"use strict"; const ctx = JSON.parse(${JSON.stringify(JSON.stringify(globals))}); ${code}`;
    const result = vm.evalCode(source);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`Sandbox: ${error?.message ?? String(error)}`);
    }
    try {
      return vm.dump(result.value);
    } finally {
      result.value.dispose();
    }
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
