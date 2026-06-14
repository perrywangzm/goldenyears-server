import { ApiError } from "@/shared/errors/apiError";
import { FilterDslSchema, filterOperatorNames, type FilterNode } from "./filterDsl.schema";

export type PredicateNode =
  | { kind: "field"; field: string; op: (typeof filterOperatorNames)[number]; value: unknown }
  | { kind: "and"; children: PredicateNode[] }
  | { kind: "or"; children: PredicateNode[] }
  | { kind: "not"; child: PredicateNode };

export interface ParsedFieldPredicate {
  field: string;
  op: (typeof filterOperatorNames)[number];
  value: unknown;
}

export function flattenFieldPredicates(filters: FilterNode | undefined): ParsedFieldPredicate[] {
  return flattenPredicateTree(parseFilterDsl(filters));
}

export function parseFilterDsl(filters: unknown): PredicateNode | undefined {
  if (!filters) {
    return undefined;
  }

  const parsed = FilterDslSchema.safeParse(filters);
  if (!parsed.success) {
    throw new ApiError("validation_failed", "Invalid filter DSL.", 422, { issues: parsed.error.issues });
  }

  return toPredicateTree(parsed.data);
}

function toPredicateTree(filters: FilterNode): PredicateNode | undefined {
  const children: PredicateNode[] = [];

  for (const [field, expression] of Object.entries(filters)) {
    if (field === "and" || field === "or") {
      const nested = (expression as FilterNode[]).map(toPredicateTree).filter((child): child is PredicateNode => !!child);
      children.push({ kind: field, children: nested });
      continue;
    }
    if (field === "not") {
      const child = toPredicateTree(expression as FilterNode);
      if (child) {
        children.push({ kind: "not", child });
      }
      continue;
    }
    if (!expression || typeof expression !== "object" || Array.isArray(expression)) {
      throw new ApiError("validation_failed", `Invalid filter for ${field}.`, 422, { field });
    }
    for (const [op, value] of Object.entries(expression)) {
      if (!filterOperatorNames.includes(op as (typeof filterOperatorNames)[number])) {
        throw new ApiError("validation_failed", `Unsupported filter operator ${op}.`, 422, {
          field,
          operator: op,
        });
      }
      children.push({ kind: "field", field, op: op as ParsedFieldPredicate["op"], value });
    }
  }

  if (children.length === 0) {
    return undefined;
  }
  return children.length === 1 ? children[0] : { kind: "and", children };
}

function flattenPredicateTree(tree: PredicateNode | undefined): ParsedFieldPredicate[] {
  if (!tree) {
    return [];
  }
  if (tree.kind === "field") {
    return [{ field: tree.field, op: tree.op, value: tree.value }];
  }
  if (tree.kind === "not") {
    return flattenPredicateTree(tree.child);
  }
  return tree.children.flatMap(flattenPredicateTree);
}
