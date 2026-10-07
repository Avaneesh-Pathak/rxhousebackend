// Remove old directory-index copies that conflict with the canonical .html pages.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '../../pharmacies frontnend'));
let removed = 0;
function clean(parent) {
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
    const dir = path.join(parent, entry.name);
    const legacy = path.join(dir, 'index.html');
    const canonical = path.join(parent, `${entry.name}.html`);
    if (fs.existsSync(legacy) && fs.existsSync(canonical)) {
      fs.unlinkSync(legacy);
      removed++;
    }
    if (parent === root && entry.name === 'blog') clean(dir);
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
}
clean(root);
console.log(`Removed ${removed} legacy index copies`);
