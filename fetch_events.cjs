const https = require('https');

const options = {
  hostname: 'zckzxjuyidetjbxszrex.supabase.co',
  path: '/rest/v1/events?select=id&limit=1',
  method: 'GET',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpja3p4anV5aWRldGpieHN6cmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDgwMzAsImV4cCI6MjA5MzcyNDAzMH0.wlRll8DWOZHUrHBoU_2ekoAbuGo1gIQpZvnxj4XrzWY',
    'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpja3p4anV5aWRldGpieHN6cmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDgwMzAsImV4cCI6MjA5MzcyNDAzMH0.wlRll8DWOZHUrHBoU_2ekoAbuGo1gIQpZvnxj4XrzWY'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log(data);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
