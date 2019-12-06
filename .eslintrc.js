module.exports = {
  env: {
    es6: false,
    node: true
  },
  plugins: [
    'jest'
  ],
  extends: [
    'eslint:recommended',
    'plugin:jest/recommended',
  ],
}
