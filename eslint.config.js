import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The type checker already carries most of the weight here (strict,
 * noUncheckedIndexedAccess, exactOptionalPropertyTypes), so these rules
 * aim at what tsc cannot see: unawaited promises, hook misuse, and the
 * architectural rules CONTRIBUTING.md calls build failures.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // LocalDate is a soft brand (`string & { __localDate?: never }`), so a
      // plain string already satisfies it and every `as LocalDate` reads as
      // unnecessary to this rule. They are deliberate documentation of which
      // strings are calendar days, so the codebase keeps them.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  {
    // The fixture provider implements an async-iterable Provider surface;
    // async generators that satisfy that interface need no await of their own.
    files: ['src/providers/fixture/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Just the two classic rules: the rest of this plugin's recommended
      // set targets the React Compiler, which Preact does not use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['src/engine/**/*.ts'],
    rules: {
      // Engine purity (CONTRIBUTING): no SDK, no DOM, no clock. This is what
      // lets the whole layout engine run under vitest's node environment.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@capacities/api', '@capacities/api/*'],
              message: 'src/engine must stay SDK-free (CONTRIBUTING: engine purity).',
            },
            {
              group: ['preact', 'preact/*'],
              message: 'src/engine must stay DOM-free (CONTRIBUTING: engine purity).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'src/engine must not touch the DOM.' },
        { name: 'window', message: 'src/engine must not touch the DOM.' },
        { name: 'localStorage', message: 'src/engine must not touch browser storage.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "The engine never reads a clock; today is injected. `new Date(value)` for calendar math is fine.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'The engine never reads a clock; today is injected.',
        },
      ],
    },
  },

  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Test doubles deliberately cast through `unknown` to stub partial
      // SDK surfaces; that is the point of a stub, not an unsafe accident.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  {
    files: ['*.{js,ts}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // This config file is not in tsconfig's include, so it gets no type info.
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
