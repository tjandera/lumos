import type { FastifyInstance } from "fastify";
import { catalogItems } from "./data.js";
import { filterCatalog, type CatalogQuery } from "./query.js";

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: CatalogQuery }>("/catalog", async (request) => {
    const items = filterCatalog(catalogItems, request.query);
    return { items };
  });

  app.get<{ Params: { id: string } }>("/catalog/:id", async (request, reply) => {
    const item = catalogItems.find((candidate) => candidate.id === request.params.id);
    if (!item) {
      reply.code(404);
      return { error: "Catalog item not found" };
    }
    return item;
  });
}
