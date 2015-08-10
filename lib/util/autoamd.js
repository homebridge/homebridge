var interceptor = require('express-interceptor');

/**
 * Express middleware that converts CommonJS-style code to RequireJS style for the browser (assuming require.js is loaded).
 */

module.exports = function(urlPrefix) {
  return interceptor(function(req, res){
    return {
      // Only URLs with the given prefix will be converted to require.js style
      isInterceptable: function(){
        return req.originalUrl.indexOf(urlPrefix) == 0;
      },
      intercept: function(body, send) {
        send(toRequireJS(body));
      }
    };
  });
}

// From https://github.com/shovon/connect-commonjs-amd/blob/master/src/middleware.coffee
function toRequireJS(str) {
  var requireCalls = str.match(/require\((\s+)?('[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")(\s+)?\)/g) || [];
  requireCalls = requireCalls.map(function(str) {
    return (str.match(/('[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")/))[0];
  });
  requireCalls.unshift("'require'");
  str = "define([" + (requireCalls.join(', ')) + "], function (require) {\nvar module = { exports: {} }\n  , exports = module.exports;\n\n(function () {\n\n" + str + "\n\n})();\n\nreturn module.exports;\n});";
  return str;
};