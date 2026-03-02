import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['dist', 'docs'],
    rules: {
      'antfu/consistent-list-newline': 'off',
      'curly': ['error'],
      'format/prettier': 'off',
      'import/extensions': 'off',
      'import/order': 'off',
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-line-alignment': 'error',
      'new-cap': 'off',
      'no-undef': 'error',
      'perfectionist/sort-exports': 'error',
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            ['type-builtin', 'type-external', 'type-internal'],
            ['type-parent', 'type-sibling', 'type-index'],
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'side-effect',
            'unknown',
          ],
          internalPattern: ['^@/.*'],
          order: 'asc',
          type: 'natural',
          newlinesBetween: 1,
        },
      ],
      'perfectionist/sort-named-exports': 'error',
      'perfectionist/sort-named-imports': 'error',
      'quotes': ['error', 'single'],
      'sort-imports': 'off',
      'style/brace-style': ['error', '1tbs'],
      'style/quote-props': ['error', 'consistent-as-needed'],
      'test/no-only-tests': 'error',
      'ts/consistent-type-imports': 'off',
      'unicorn/no-useless-spread': 'error',
      'unused-imports/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
    typescript: true,
    formatters: {
      css: true,
      html: true,
      markdown: true,
      svg: true,
    },
  })
  .append({
    files: ['**/*.md'],
    rules: {
      'jsdoc/check-alignment': 'off',
      'jsdoc/check-line-alignment': 'off',
      'markdown/fenced-code-language': 'off',
      'markdown/require-alt-text': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-exports': 'off',
      'perfectionist/sort-named-imports': 'off',
    },
  })
