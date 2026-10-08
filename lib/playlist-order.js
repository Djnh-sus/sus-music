export function moveItem(list, from, to) {
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < list.length;
  if (!valid(from) || !valid(to) || from === to) return list;

  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function reindex(list) {
  return list.map((item, index) => (item.position === index ? item : { ...item, position: index }));
}

export function changedRows(before, after) {
  const previous = new Map(before.map((row) => [row.id, row.position]));
  return after.filter((row) => previous.get(row.id) !== row.position);
}
