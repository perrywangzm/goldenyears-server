import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";
import { openAppDatabase } from "@/db/createAppDatabase";

export const databaseMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const scope = openAppDatabase(c.env);
  c.set("repos", scope.repos);
  try {
    await next();
  } finally {
    await scope.close();
  }
});
