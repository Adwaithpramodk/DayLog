// build.js - Creates config.js during deployment
const fs = require('fs');

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID;

if (!projectId) {
  console.error('Error: APPWRITE_PROJECT_ID environment variable is missing!');
  process.exit(1);
}

const content = `
export const appwriteConfig = {
    endpoint: '${endpoint}',
    projectId: '${projectId}'
};
`;

fs.writeFileSync('./config.js', content);
console.log('Successfully created config.js for deployment!');
