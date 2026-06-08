import type { CollectionItem } from "../api/organization";

const collectionItemCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function compareText(a?: string | null, b?: string | null) {
  return collectionItemCollator.compare(a || "", b || "");
}

export function compareCollectionItems(a: CollectionItem, b: CollectionItem) {
  const folderCompare = compareText(a.folder_path, b.folder_path);
  if (folderCompare !== 0) return folderCompare;

  if (a.import_relative_path || b.import_relative_path) {
    const pathCompare = compareText(a.import_relative_path || a.title, b.import_relative_path || b.title);
    if (pathCompare !== 0) return pathCompare;
  }

  const orderCompare = a.sort_order - b.sort_order;
  if (orderCompare !== 0) return orderCompare;
  return compareText(a.title, b.title);
}
