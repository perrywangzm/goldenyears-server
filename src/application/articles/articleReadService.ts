import type { Repositories } from "@/db/repositories/ports";

export class ArticleReadService {
  constructor(private readonly repos: Repositories) {}

  async list(limit: number, offset: number) {
    const result = await this.repos.articles.listPublished(limit, offset);
    return {
      data: result.rows.map(toArticleDto),
      page: { type: "offset" as const, limit, offset, has_more: result.hasMore, total_count: result.total },
    };
  }

  async get(id: string) {
    return toArticleDto(await this.repos.articles.getPublished(id));
  }
}

function toArticleDto(article: {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  published_at: Date | string;
}) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    category: article.category,
    published_at: new Date(article.published_at).toISOString(),
  };
}
