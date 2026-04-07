const Database = require('better-sqlite3');
const path = require('path');

module.exports = function () {
	const dbPath = path.join(__dirname, '..', 'data', 'patterns.db');
	let db;
	try {
		db = new Database(dbPath, { readonly: true });
	} catch (e) {
		console.warn('patterns.db not found, skipping patterns data:', e.message);
		return { items: [], categories: [] };
	}

	const where = `WHERE engine IN ('both', 'hyperscript')
		  AND feature != 'hyperfixi-extensions'`;

	const rows = db.prepare(`
		SELECT id, title, raw_code, description, feature, engine
		FROM code_examples ${where}
		ORDER BY feature, title
	`).all();

	const categories = db.prepare(`
		SELECT DISTINCT feature FROM code_examples ${where}
		  AND feature IS NOT NULL
		ORDER BY feature
	`).all().map(r => r.feature);

	db.close();

	return {
		items: rows.map(row => ({
			id: row.id,
			title: row.title,
			code: row.raw_code,
			description: row.description,
			category: row.feature,
			engine: row.engine,
		})),
		categories,
	};
};
