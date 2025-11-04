// eslint.config.mjs
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts"],
		plugins: {
			obsidianmd,
		},
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			...obsidianmd.configs.recommended,
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
		},
	},

	{
		ignores: ["main.js", "*.config.mjs", "node_modules"],
	},
];
