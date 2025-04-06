// envUtils.js
const fs = require('fs');
const path = require('path');

function updateEnvVariable(key, value) {
  const envPath = path.resolve(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}`;
  }

  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log(`🔄 Aktualizováno v .env: ${key}=${value}`);
}

module.exports = { updateEnvVariable };
