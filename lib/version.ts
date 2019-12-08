import * as fs  from 'fs';
import * as path from 'path';

export function getVersion() {
  const packageJSONPath: string = path.join(__dirname, '../package.json');
  const packageJSON: any = (fs.existsSync(packageJSONPath)) ? JSON.parse(fs.readFileSync(packageJSONPath, 'utf8')) : { version: '', name: '', author: { name: ''} };
  return packageJSON.version;
}
