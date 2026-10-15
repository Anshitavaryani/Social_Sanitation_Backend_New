const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "public/uploads/**", "logs/**", "src/seeders/dumps/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // Errors: these crash at runtime
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-const-assign": "error",
      "no-func-assign": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      // Warnings: dead code
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
    },
  },
  {
    // HTML templates rendered by Puppeteer run code inside the browser page
    files: ["src/config/puppeteer.js", "src/config/serviceEstimate.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
