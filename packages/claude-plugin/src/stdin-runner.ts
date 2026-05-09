/** Read all data from process.stdin as a string. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Run a hook entry point: read stdin, parse, handle, write stdout. */
export function runHookEntry<I, O>(
  name: string,
  parse: (raw: string) => I | null,
  handle: (input: I) => Promise<O>,
): void {
  const task = async (): Promise<void> => {
    const raw = await readStdin();
    const input = parse(raw);
    if (input === null) {
      process.stdout.write("{}\n");
      return;
    }
    const output = await handle(input);
    process.stdout.write(JSON.stringify(output) + "\n");
  };

  task().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`obsidian-vfs ${name} error: ${message}\n`);
    process.stdout.write("{}\n");
  });
}
