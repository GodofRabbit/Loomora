export function sortGalleryItems(items = []) {
  return [...items].sort((a, b) => {
    const dateDifference = String(b.date || '').localeCompare(
      String(a.date || ''),
    );
    const timeDifference =
      (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    return (
      dateDifference ||
      timeDifference ||
      String(b.name).localeCompare(String(a.name))
    );
  });
}

export function distributeGalleryItems(items, columnCount) {
  const columns = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => columns[index % columnCount].push(item));
  return columns;
}
