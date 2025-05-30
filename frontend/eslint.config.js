import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import unusedImports from "eslint-plugin-unused-imports";
import importPlugin from "eslint-plugin-import";
import stylistic from "@stylistic/eslint-plugin";
import stylisticTs from "@stylistic/eslint-plugin-ts";
import parserTs from "@typescript-eslint/parser";

export default tseslint.config(
	{ ignores: ["dist"] },
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parser: parserTs,
		},
		settings: {
			"import/resolver": {
				node: {
					extensions: [".js", ".jsx", ".ts", ".tsx"],
					moduleDirectory: ["src", "node_modules"],
				},
			},
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
			"unused-imports": unusedImports,
			import: importPlugin,
			"@stylistic": stylistic,
			"@stylistic/ts": stylisticTs,
		},
		rules: {
			"@stylistic/no-multiple-empty-lines": ["warn", { max: 1 }],
			"unused-imports/no-unused-imports": "error",
			"@typescript-eslint/no-explicit-any": "off",
 			"unused-imports/no-unused-vars": [
				"warn",
				{
					vars: "all",
					varsIgnorePattern: "^_",
					args: "after-used",
					argsIgnorePattern: "^_",
				},
			],
			"no-multi-spaces": "warn",
			"react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
			"@stylistic/semi": ["error", "always"],
			"@stylistic/comma-dangle": ["error", "always-multiline"],
			"@stylistic/space-infix-ops": "error",
			"@stylistic/keyword-spacing": ["warn", { before: true }],
			"@stylistic/no-trailing-spaces": "warn",
			"@stylistic/eol-last": ["warn", "always"],
			"@stylistic/brace-style": ["warn", "1tbs", { allowSingleLine: true }],
			"@stylistic/array-bracket-spacing": ["error", "never"],
			"@stylistic/object-curly-spacing": ["error", "always"],
			//"@stylistic/object-curly-newline": ["error", { multiline: true }],
			"@stylistic/func-call-spacing": ["error", "never"],
			"@stylistic/comma-spacing": ["error", { before: false, after: true }],
			"@stylistic/quotes": ["error", "double"],
			//"@stylistic/ts/indent": ["warn", 4],
			"@stylistic/indent": ["warn", "tab"],
			"@stylistic/ts/type-annotation-spacing": ["error", { before: false, after: true }],
			"@stylistic/ts/member-delimiter-style": [
				"error",
				{
					multiline: { delimiter: "comma", requireLast: true },
					singleline: { delimiter: "comma", requireLast: false },
				},
			],
			"@stylistic/padding-line-between-statements": [
				"error",
				{ blankLine: "always", prev: "*", next: "return" },
				{ blankLine: "always", prev: "block-like", next: "*" },
			],
			"import/no-unresolved": "off",
			"import/order": [
				"warn",
				{
					groups: [["builtin", "external"], "internal", ["parent", "sibling", "index"], "object", "type"],
					"newlines-between": "always",
					alphabetize: {
						order: "asc",
					},
					pathGroups: [
						{
							pattern: "./**/*.less",
							group: "object",
						},
						{
							pattern: "**/*.less",
							group: "object",
						},
						{
							pattern: "./**/*.{jpg,jpeg,png,gif,svg,ico}",
							group: "type",
						},
						{
							pattern: "**/*.{jpg,jpeg,png,gif,svg,ico}",
							group: "type",
						},
					],
				},
			],
			...reactHooks.configs.recommended.rules,
		},
	},
);