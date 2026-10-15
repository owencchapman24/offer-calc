// The hooks linter (audit H1): the rules of hooks and every hook's dependency list, in the app, and nothing else (style is
// the code's own, and tsc checks the rest). A dependency left out on purpose says why beside its eslint-disable comment, and
// a disable comment that no longer disables anything is an error, so the list of exceptions can't go stale.
// The parser is Babel's: TypeScript 7 has no JavaScript compiler API, so typescript-eslint's parser can't run on it. The hooks
// rules need only the syntax tree, not types.
import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";

/** Babel's parser for TypeScript, with JSX only where the file is .tsx (in a .ts file, `<T>(x: T) => x` is a generic). */
const parsing = (plugins) => ({
  parser: babelParser,
  parserOptions: { requireConfigFile: false, babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins } } },
});

export default [
  { files: ["app/src/**/*.ts"], languageOptions: parsing(["typescript"]) },
  { files: ["app/src/**/*.tsx"], languageOptions: parsing(["jsx", "typescript"]) },
  {
    files: ["app/src/**/*.{ts,tsx}"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
