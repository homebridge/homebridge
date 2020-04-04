import fs from "fs";
import path from "path";

export default function getVersion(): string {
  const packageJSONPath = path.join(__dirname, "../package.json");
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, { encoding: "utf8" }));
  return packageJSON.version;
}
