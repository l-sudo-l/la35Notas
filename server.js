const http = require('http');
const cfg = require('./src/config');
require('./src/db');
require('./src/routes/auth');
require('./src/routes/usuarios');
require('./src/routes/academico');
require('./src/routes/comunicados');
const { handler } = require('./src/http');
const { get } = require('./src/db');

if (!get('SELECT 1 FROM usuarios LIMIT 1')) console.log('⚠  Base vacía. Ejecutá: npm run seed');
http.createServer(handler).listen(cfg.port, () => console.log(`${cfg.school} escuchando en http://localhost:${cfg.port}`));
