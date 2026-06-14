import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateOpenApiDocument } from "../../src/interface/openapi/exportOpenApi";

const currentDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(currentDir, "../../openapi.json");
const document = generateOpenApiDocument();

writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
