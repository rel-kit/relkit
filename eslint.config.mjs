export default [
  {
    ignores: [
      "**/.git/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.zsys/**",
      "repos/effect/**",
    ],
  },
  {
    files: ["**/*.{cjs,js,mjs}"],
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
