export const createNodeDb = (): never => {
  throw new Error("The Node SQLite driver is not available on Cloudflare Workers; bind D1 as DB.");
};
