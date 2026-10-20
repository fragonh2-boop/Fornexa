import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./test-resolver.mjs", pathToFileURL("./scripts/"));
