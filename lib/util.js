
// Converts "accessToken" to "Access Token"
export function camelCaseToRegularForm(camelCase: string): string {
  return camelCase
    // insert a space before all caps
    .replace(/([A-Z])/g, ' $1')
    // uppercase the first character
    .replace(/^./, function(str){ return str.toUpperCase(); })
}