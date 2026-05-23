import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eslintConfig } from "@samhenrytech/eslint-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  ...eslintConfig,

  // JavaScript and TypeScript files
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Your custom rules here
    },
  },
];
