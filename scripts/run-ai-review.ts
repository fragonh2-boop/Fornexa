import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getReviewProviderReadiness,
  runMultiModelReview,
  validateOutboundReviewPacket,
  type ReviewPacket,
} from "../lib/ai-orchestrator.ts";

function usage() {
  return "Usage: pnpm ai:review -- <packet.json> [--execute] [--round=1|2]";
}

async function main() {
  const args = process.argv.slice(2);
  const packetPath = args.find((arg) => !arg.startsWith("--"));
  if (!packetPath) throw new Error(usage());

  const execute = args.includes("--execute");
  const roundArg = args.find((arg) => arg.startsWith("--round="));
  const opinionRound = roundArg ? Number.parseInt(roundArg.slice("--round=".length), 10) : 1;
  if (!Number.isInteger(opinionRound) || opinionRound < 1 || opinionRound > 2) {
    throw new Error("--round must be 1 or 2");
  }

  const source = await readFile(resolve(packetPath), "utf8");
  const packet = JSON.parse(source) as ReviewPacket;
  validateOutboundReviewPacket(packet);

  const readiness = getReviewProviderReadiness();
  if (!execute) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      taskId: packet.taskId,
      dataClassification: packet.dataClassification,
      changedFileCount: packet.changedFiles.length,
      diffCharacters: packet.diff?.length ?? 0,
      opinionRound,
      providers: readiness,
    }, null, 2)}\n`);
    return;
  }

  const configured = readiness.filter((provider) => provider.configured);
  if (configured.length === 0) {
    throw new Error("No review provider has both an API key and model configured");
  }

  const result = await runMultiModelReview(packet, { opinionRound });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown review runner error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
