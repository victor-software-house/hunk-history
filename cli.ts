import { readFile } from "node:fs/promises";
import type { ExtensionCliCommandHandler } from "hunkdiff/extension";

const usage = "Usage: hunk history instructions\n\nPrint the bundled history skill for this extension version.\nThis does not establish whether history is enabled in a live review window.\n";

export const historyInstructions: ExtensionCliCommandHandler = async (args, ctx) => {
  if (args.length === 1 && args[0] === "instructions") {
    const content = await readFile(new URL("./skills/hunk-history/SKILL.md", import.meta.url), {
      encoding: "utf8", signal: ctx.signal,
    });
    await ctx.stdout.write(content);
    return { kind: "exit" };
  }
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]!))) {
    await ctx.stdout.write(usage);
    return { kind: "exit" };
  }
  await ctx.stderr.write(usage);
  return { kind: "exit", code: 2 };
};
