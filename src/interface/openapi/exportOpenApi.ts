import { createApiApp } from "@/interface/app";
import { openApiConfig } from "@/interface/openapi/registry";

export function generateOpenApiDocument() {
  return createApiApp().getOpenAPI31Document(openApiConfig);
}
