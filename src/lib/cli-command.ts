import { redact } from "./redaction.ts";

const SENSITIVE_VALUE_FLAGS = new Set([
  "--api-key",
  "--api_key",
  "--authorization",
  "--password",
  "--secret",
  "--token"
]);

export const CLI_COMMAND_RECORD_CONTRACT = Object.freeze({
  policy: "bounded_redacted_cli_command_record",
  max_argument_count: 100,
  max_argument_bytes: 1_024,
  max_command_bytes: 4_096,
  sensitive_value_flags: [...SENSITIVE_VALUE_FLAGS],
  raw_arguments_exposed: false,
  sensitive_argument_values_exposed: false
});

function boundedUtf8Prefix(value, maxBytes) {
  let output = "";
  let bytes = 0;
  for (const character of String(value ?? "")) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) {
      return { text: output, truncated: true };
    }
    output += character;
    bytes += characterBytes;
  }
  return { text: output, truncated: false };
}

function normalizedRecordedArgument(value) {
  const normalized = redact(value).replace(/\s+/g, " ").trim();
  return normalized || '""';
}

export function buildCliCommandRecord(args) {
  const rawArgs = Array.isArray(args) ? args : [];
  const recordedArgs = [];
  let commandTruncated = rawArgs.length > CLI_COMMAND_RECORD_CONTRACT.max_argument_count;
  let redactNextValue = false;

  for (const rawArgument of rawArgs.slice(0, CLI_COMMAND_RECORD_CONTRACT.max_argument_count)) {
    if (redactNextValue) {
      recordedArgs.push("<REDACTED>");
      redactNextValue = false;
      continue;
    }
    const bounded = boundedUtf8Prefix(rawArgument, CLI_COMMAND_RECORD_CONTRACT.max_argument_bytes);
    commandTruncated ||= bounded.truncated;
    const recorded = normalizedRecordedArgument(bounded.text);
    recordedArgs.push(recorded);
    redactNextValue = SENSITIVE_VALUE_FLAGS.has(recorded.toLowerCase());
  }

  const joined = `pala ${recordedArgs.join(" ")}`.trim();
  const boundedCommand = boundedUtf8Prefix(joined, CLI_COMMAND_RECORD_CONTRACT.max_command_bytes);
  commandTruncated ||= boundedCommand.truncated;
  return {
    contract: CLI_COMMAND_RECORD_CONTRACT,
    command: boundedCommand.text,
    command_bytes: Buffer.byteLength(boundedCommand.text, "utf8"),
    command_truncated: commandTruncated,
    argument_count: rawArgs.length,
    argument_count_exact: true,
    recorded_argument_count: recordedArgs.length,
    raw_arguments_exposed: false,
    sensitive_argument_values_exposed: false
  };
}
