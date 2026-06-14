import { generateOpenApiDocument } from "../../src/interface/openapi/exportOpenApi";

type Operation = {
  operationId?: string;
  parameters?: Array<{ in?: string }>;
};

type PathItem = Record<string, Operation | unknown>;

const allowedNonOperationKeys = new Set(["parameters", "summary", "description", "$ref"]);
const httpMethods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

export function checkApiConventions(document = generateOpenApiDocument()) {
  const violations: string[] = [];
  const paths = (document.paths ?? {}) as Record<string, PathItem>;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!path.startsWith("/api/v1/")) {
      continue;
    }

    for (const [method, operation] of Object.entries(pathItem)) {
      if (allowedNonOperationKeys.has(method)) {
        continue;
      }
      if (!httpMethods.has(method)) {
        continue;
      }

      const op = operation as Operation;
      const endpointName = path.split("/").at(-1);
      if (method !== "post") {
        violations.push(`${method.toUpperCase()} ${path} must use POST.`);
      }
      if (op.operationId !== endpointName) {
        violations.push(`${method.toUpperCase()} ${path} operationId must equal ${endpointName}.`);
      }
      const pathOrQueryParameters = (op.parameters ?? []).filter(
        (parameter) => parameter.in === "path" || parameter.in === "query",
      );
      if (pathOrQueryParameters.length > 0) {
        violations.push(`${method.toUpperCase()} ${path} must not declare path or query parameters.`);
      }
    }
  }

  return violations;
}

const violations = checkApiConventions();
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("API convention checks passed.");
