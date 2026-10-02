/**
 * Paginated response used by the tracks endpoint.
 *
 * AVANCÉ (facultatif, TP2) : this matches the shape returned by the backend's
 * `mongoose-aggregate-paginate-v2` plugin (`Track.aggregatePaginate(...)` in
 * `backend/src/app.js`), which replaced the earlier hand-written
 * `{ items, page, limit, total, pages }` shape. See `API_CONTRACT.md`.
 */
export interface Page<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
}
