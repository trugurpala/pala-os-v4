import process from "node:process";

export const CLI_OUTPUT_CONTRACT = Object.freeze({
  policy: "close_database_before_stdout_json",
  max_output_bytes: 5_000_000,
  serialization_preflight_before_database_close: true,
  serialization_failure_error: "cli_output_blocked:serialization_failed",
  output_byte_limit_error: "cli_output_blocked:output_exceeds_byte_limit",
  unsafe_output_policy: "payload_free_failure_json_after_database_close",
  database_close_failure_error: "cli_output_blocked:database_close_failed",
  top_level_failure_policy: "nonzero_without_raw_stack_or_pending_payload",
  top_level_failure_error: "cli_top_level_failed",
  top_level_failure_output_policy: "fixed_payload_free_json_best_effort",
  command_failure_policy: "structured_payload_free_without_stack",
  command_failure_error: "cli_command_failed",
  unknown_command_policy: "structured_payload_free_without_raw_command",
  unknown_command_error: "unknown_command",
  raw_unknown_command_exposed: false,
  raw_error_exposed: false,
  stack_exposed: false,
  payload_exposed_on_failure: false
});

function safeErrorCode(error) {
  try {
    return typeof error?.code === "string" && /^[a-z][a-z0-9_:-]{0,79}$/i.test(error.code)
      ? error.code
      : null;
  } catch {
    return null;
  }
}

function outputFailure(error) {
  return {
    status: "blocked",
    exit_code: 1,
    error,
    payload_exposed_on_failure: false
  };
}

function serializeCliOutput(output) {
  let serialized;
  try {
    serialized = JSON.stringify(output, null, 2);
  } catch {
    const error = CLI_OUTPUT_CONTRACT.serialization_failure_error;
    const payload = `${JSON.stringify(outputFailure(error), null, 2)}\n`;
    return { status: "blocked", exitCode: 1, error, payload, payload_replaced: true };
  }
  if (typeof serialized !== "string") {
    const error = CLI_OUTPUT_CONTRACT.serialization_failure_error;
    const payload = `${JSON.stringify(outputFailure(error), null, 2)}\n`;
    return { status: "blocked", exitCode: 1, error, payload, payload_replaced: true };
  }
  const payload = `${serialized}\n`;
  if (Buffer.byteLength(payload, "utf8") > CLI_OUTPUT_CONTRACT.max_output_bytes) {
    const error = CLI_OUTPUT_CONTRACT.output_byte_limit_error;
    const failurePayload = `${JSON.stringify(outputFailure(error), null, 2)}\n`;
    return { status: "blocked", exitCode: 1, error, payload: failurePayload, payload_replaced: true };
  }
  return { status: "safe_to_execute", exitCode: null, error: null, payload, payload_replaced: false };
}

export function cliFailureResult(error) {
  return {
    status: "blocked",
    exitCode: 1,
    error: CLI_OUTPUT_CONTRACT.command_failure_error,
    error_code: safeErrorCode(error),
    raw_error_exposed: CLI_OUTPUT_CONTRACT.raw_error_exposed,
    stack_exposed: CLI_OUTPUT_CONTRACT.stack_exposed
  };
}

export function topLevelCliFailureResult(error) {
  return {
    status: "blocked",
    exit_code: 1,
    error: CLI_OUTPUT_CONTRACT.top_level_failure_error,
    error_code: safeErrorCode(error),
    raw_error_exposed: CLI_OUTPUT_CONTRACT.raw_error_exposed,
    stack_exposed: CLI_OUTPUT_CONTRACT.stack_exposed,
    payload_exposed_on_failure: false
  };
}

export function writeTopLevelCliFailure(error, options = {}) {
  const result = topLevelCliFailureResult(error);
  const write = options.write || ((payload) => process.stdout.write(payload));
  let outputWritten = false;
  try {
    write(`${JSON.stringify(result, null, 2)}\n`);
    outputWritten = true;
  } catch {
    outputWritten = false;
  }
  return {
    ...result,
    output_written: outputWritten
  };
}

export function unknownCliCommandResult(knownCommands) {
  return {
    status: "blocked",
    exitCode: 1,
    error: CLI_OUTPUT_CONTRACT.unknown_command_error,
    raw_unknown_command_exposed: CLI_OUTPUT_CONTRACT.raw_unknown_command_exposed,
    known_commands: knownCommands
  };
}

export function writeCliOutputAfterDatabaseClose(db, output, options = {}) {
  const serialized = serializeCliOutput(output);
  try {
    db.close();
  } catch {
    throw new Error(CLI_OUTPUT_CONTRACT.database_close_failure_error);
  }
  const write = options.write || ((payload) => process.stdout.write(payload));
  write(serialized.payload);
  return {
    status: serialized.status,
    exitCode: serialized.exitCode,
    error: serialized.error,
    output_bytes: Buffer.byteLength(serialized.payload, "utf8"),
    payload_replaced: serialized.payload_replaced,
    payload_exposed_on_failure: false
  };
}
