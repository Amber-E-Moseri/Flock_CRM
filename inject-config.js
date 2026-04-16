const fs = require('fs');

const filePath = 'index.html';
let html = fs.readFileSync(filePath, 'utf8');

const apiUrl = process.env.FLOCK_API_URL || '';
const apiToken = process.env.FLOCK_API_TOKEN || '';

html = html.replace(/__FLOCK_API_URL__/g, apiUrl);
html = html.replace(/__FLOCK_API_TOKEN__/g, apiToken);

fs.writeFileSync(filePath, html, 'utf8');
console.log('Injected Flock config into index.html');
