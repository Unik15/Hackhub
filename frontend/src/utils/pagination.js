export const ELLIPSIS = "ellipsis";

export function getPageItems(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const visible = new Set([1, totalPages]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) visible.add(page);
  }

  const sorted = [...visible].sort((a, b) => a - b);
  const items = [];

  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) items.push(ELLIPSIS);
    items.push(page);
  });

  return items;
}
