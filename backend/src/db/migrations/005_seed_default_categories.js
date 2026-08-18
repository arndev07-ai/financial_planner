const { DEFAULT_CATEGORIES } = require('../defaultCategories');

exports.up = (db) => {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO categories (user_id, name, type, color, icon, is_default)
     VALUES (NULL, ?, ?, ?, ?, 1)`
  );
  const tx = db.transaction((cats) => {
    for (const c of cats) insert.run(c.name, c.type, c.color, c.icon);
  });
  tx(DEFAULT_CATEGORIES);
};

exports.down = (db) => {
  db.prepare("DELETE FROM categories WHERE user_id IS NULL").run();
};
