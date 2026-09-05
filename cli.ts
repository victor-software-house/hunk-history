import { readFile } from "node:fs/promises";
import type { ExtensionCliCommandHandler } from "hunkdiff/extension";

const usage = `Hunk History — extension instructions

Usage:
  hunk history instructions
  hunk history help
  hunk history instructions --help

Commands:
  instructions  Print the bundled history skill verbatim.
  help          Show this help. Also accepts --help or -h.

Review operations:
  Use Hunk's native session commands, documented by instructions.
  This command does not control or inspect a live history pane.
  CLI availability does not establish that history is enabled in a live window.
`;

export const historyInstructions: ExtensionCliCommandHandler = async (args, ctx) => {
  const [command, option] = args;
  const help = args.length === 0
    || (args.length === 1 && (command === "help" || command === "--help" || command === "-h"))
    || (args.length === 2 && command === "instructions" && (option === "--help" || option === "-h"))
    || (args.length === 2 && command === "help" && option === "instructions");
  if (help) {
    await ctx.stdout.write(usage);
    return { kind: "exit" };
  }
  if (args.length === 1 && command === "instructions") {
    const content = await readFile(new URL("./skills/hunk-history/SKILL.md", import.meta.url), {
      encoding: "utf8", signal: ctx.signal,
    });
    await ctx.stdout.write(content);
    return { kind: "exit" };
  }
  const error = command === "instructions" || command === "help"
    ? "Unexpected arguments."
    : `Unknown history command: ${JSON.stringify(command)}.`;
  await ctx.stderr.write(`${error}\nRun 'hunk history --help' for usage.\n`);
  return { kind: "exit", code: 2 };
};
