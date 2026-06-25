export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function paginationFromRequest(request, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get('limit'), defaultLimit, 1, maxLimit);
  const cursor = clampInt(url.searchParams.get('cursor'), 0, 0, Number.MAX_SAFE_INTEGER);
  return { limit, cursor };
}

export function paginateArray(items = [], { limit = DEFAULT_LIMIT, cursor = 0 } = {}) {
  const total = Array.isArray(items) ? items.length : 0;
  const start = clampInt(cursor, 0, 0, total);
  const pageLimit = clampInt(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const data = (items || []).slice(start, start + pageLimit);
  const nextCursor = start + data.length < total ? String(start + data.length) : null;
  return {
    items: data,
    pagination: {
      limit: pageLimit,
      cursor: String(start),
      nextCursor,
      total,
      hasMore: Boolean(nextCursor),
    },
  };
}

export function paginatedField(field, items, options) {
  const page = paginateArray(items, options);
  return { [field]: page.items, pagination: page.pagination };
}

function clampInt(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
