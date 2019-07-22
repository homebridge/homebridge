import fs from 'fs';
import path from 'path';

function getVersion(): string {
  const packageJSONPath = path.join(__dirname, '../package.json');
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf8'));
  return packageJSON.version;
}

export default getVersion();
