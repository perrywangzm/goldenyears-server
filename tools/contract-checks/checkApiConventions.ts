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
      const pathParts = path.split("/").filter(Boolean).slice(2);
      const endpointName = pathParts.at(-1);
      const surface = pathParts.length >= 2 ? pathParts[0] : null;
      const authActions = new Set([
        "login",
        "logout",
        "signup",
        "confirm_verification",
        "request_password_reset",
        "confirm_password_reset",
        "resend_verification",
      ]);
      const isAuthOperation =
        pathParts.length === 3 && pathParts[1] === "auth" && authActions.has(endpointName ?? "");
      const expectedOperationId = isAuthOperation
        ? `${surface}_auth_${endpointName}`
        : surface
          ? `${surface}_${endpointName}`
          : endpointName;
      if (pathParts.length > 2 && !isAuthOperation) {
        violations.push(`${method.toUpperCase()} ${path} must not nest resources below the API surface.`);
      }
      if (method !== "post") {
        violations.push(`${method.toUpperCase()} ${path} must use POST.`);
      }
      if (surface && !["public", "user", "partner", "admin"].includes(surface)) {
        violations.push(`${method.toUpperCase()} ${path} uses an unsupported API surface.`);
      }
      if (op.operationId !== expectedOperationId) {
        violations.push(`${method.toUpperCase()} ${path} operationId must equal ${expectedOperationId}.`);
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
