/** Minimal assertions for tests. */
/** Assert a condition with an optional explanation. */
export function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

/** Compare JSON-compatible values structurally. */
export function equal(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
}

/** Assert that an operation throws an error of the specified type and optional message. */
export function throws(
  fn: () => unknown,
  type: new (...args: never[]) => Error = Error,
  message?: RegExp,
): void {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof type)) throw new Error(`Expected ${type.name}, got ${String(error)}`);
    if (message && !message.test(error.message))
      throw new Error(`Unexpected error: ${error.message}`);
    return;
  }
  throw new Error(`Expected ${type.name} to be thrown`);
}
