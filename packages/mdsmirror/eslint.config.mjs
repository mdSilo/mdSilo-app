import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import react from "eslint-plugin-react";

export default [
  { ignores: ["dist/", "node_modules/"] },
  react.configs.flat.recommended,
  ...tsPlugin.configs["flat/recommended"],
  // eslint-config-prettier, then the prettier/prettier rule
  prettierRecommended,
  importPlugin.flatConfigs.errors,
  importPlugin.flatConfigs.warnings,
  importPlugin.flatConfigs.typescript,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      eqeqeq: 2,
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "no-mixed-operators": "off",
      "react/display-name": "off",
      "import/no-named-as-default": "off",
      "react/prop-types": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "prettier/prettier": [
        "error",
        {
          printWidth: 80,
          trailingComma: "es5",
        },
      ],
    },
    settings: {
      react: {
        // "detect" calls context.getFilename(), which eslint 10 removed
        version: "19.3",
      },
      "import/resolver": {
        typescript: {},
      },
    },
  },
];
