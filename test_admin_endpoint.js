const http = require('http');

const options = {
  hostname: '192.168.219.128',
  port: 8080,
  path: '/api/b2b/admin/settings',
  method: 'GET',
  headers: {
    'User-Agent': 'Node-Test'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data.substring(0, 200));
    try {
      const jsonData = JSON.parse(data);
      console.log('Parsed:', jsonData);
    } catch (e) {
      console.log('Not JSON');
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error.message);
});

req.end();
