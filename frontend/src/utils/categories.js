import { DEFAULT_CATEGORIES } from '../data/defaultCategories';

export function getCategoryMeta(categories, name, type = 'expense') {
  const found = categories.find((c) => c.name === name && (c.type === type || !type));
  if (found) return { color: found.color, icon: found.icon };
  const def = DEFAULT_CATEGORIES.find((c) => c.name === name && c.type === type);
  if (def) return { color: def.color, icon: def.icon };
  return { color: '#64748b', icon: 'tag' };
}
