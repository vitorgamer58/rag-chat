import eslint from "@eslint/js"
import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"
import globals from "globals"
import eslintConfigPrettier from "eslint-config-prettier/flat"

export default defineConfig([
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      globals: globals.node,
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname }
    }
  },
  {
    // Onion Architecture: dependencies only point inwards (infra -> application -> domain)
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)(application|infra)(/|$)",
              message: "The domain layer must not depend on the application or infra layers."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)infra(/|$)",
              message: "The application layer must not depend on the infra layer."
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
])
