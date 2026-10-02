const http = require('http');
const conf = require('./src/config');
require('./src/db');
require('./src/routes/auth');
require('./src/routes/usuarios');
require('./src/routes/academico');
require('./src/routes/comunicados');
const { manejador } = require('./src/http');
const { uno } = require('./src/db');

if (!uno('SELECT 1 FROM usuarios LIMIT 1')) console.log('⚠  Base vacía. Ejecutá: npm run seed');
http.createServer(manejador).listen(conf.port, () => console.log(`${conf.colegio} escuchando en http://localhost:${conf.port}`));
