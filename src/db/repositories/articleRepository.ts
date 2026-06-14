import { ApiError } from "@/shared/errors/apiError";
import type { InMemoryStore } from "./inMemoryStore";

export class ArticleRepository {
  constructor(private readonly store: InMemoryStore) {}

  listPublished(limit: number, offset: number) {
    const rows = this.store.articles
      .filter((article) => article.status === "published")
      .toSorted((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    return {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      hasMore: offset + limit < rows.length,
    };
  }

  getPublished(idOrSlug: string) {
    const article = this.store.articles.find(
      (row) => row.status === "published" && (row.id === idOrSlug || row.slug === idOrSlug),
    );
    if (!article) {
      throw new ApiError("article_not_found", "Article was not found.", 404, { id: idOrSlug });
    }
    return article;
  }
}
