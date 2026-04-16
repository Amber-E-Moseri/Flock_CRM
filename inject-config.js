const fs = require('fs');

const filePath = 'index.html';
let html = fs.readFileSync(filePath, 'utf8');

const apiUrl = process.env.FLOCK_CLIENT_API_URL || '';
html = html.replace(/__FLOCK_CLIENT_API_URL__/g, apiUrl);

fs.writeFileSync(filePath, html, 'utf8');
console.log('Injected Flock API URL into index.html');
