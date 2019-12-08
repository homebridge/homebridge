var path = require('path');
var webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {  
  entry: { 
    homebridge: "./lib/main.ts"
  },
  target: 'node',
  module: {
    rules: [
      { test: /\.ts(x?)$/, loader: 'ts-loader' },      
      { test: /\.json$/, loader: 'json-loader' }
    ]
  },
  plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': '"production"',
            PACKAGE_VERSION: JSON.stringify(require("./package.json").version),
            PACKAGE_NAME: JSON.stringify(require("./package.json").name),
            PACKAGE_AUTHOR: JSON.stringify(require("./package.json").author.name)
        }),
        new CopyPlugin([
          { from: './package.json', to: './' },
        ])
    ],
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, 'dist'),
    filename: '[name].js'
  },
};
