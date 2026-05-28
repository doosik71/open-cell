# Common Development Problems & Solutions

This document tracks recurring issues encountered during the development of **Open Cell** and provides solutions to prevent them in the future.

## 1. Environment & Shell Compatibility
- **Problem:** Using Linux-style commands (e.g., `mkdir -p`, `&&`) in Windows PowerShell.
- **Cause:** PowerShell handles command chaining and flags differently than Bash.
- **Solution:** 
    - Use separate commands or ensure PowerShell-compatible syntax.
    - Be mindful that the agent is operating on `win32`.

## 2. TypeScript ESM (ECMAScript Modules)
- **Problem:** `TSError: Unable to compile TypeScript` regarding imports/exports.
- **Cause:** Node.js defaults to CommonJS. Setting `"type": "module"` in `package.json` requires specific configuration.
- **Solution:**
    - Add `"type": "module"` to `package.json`.
    - Use `node --loader ts-node/esm` for running scripts.
    - **Crucial:** Local imports must include the `.js` extension (e.g., `import { x } from './file.js'`).

## 3. Express 5.x Routing (path-to-regexp v8)
- **Problem:** `PathError: Missing parameter name at index X` when using `app.get('*')` or `app.get('(.*)')`.
- **Cause:** Express 5 uses a newer version of `path-to-regexp` which is stricter about wildcard syntax.
- **Solution:**
    - Avoid `*` in `app.get`.
    - For a catch-all route (e.g., serving a SPA), use middleware: 
      ```javascript
      app.use((req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
      });
      ```

## 4. JSX Syntax Errors
- **Problem:** `Unexpected token` when using `>` or `<` inside JSX text.
- **Cause:** These characters are reserved for tag delimiters in JSX.
- **Solution:** 
    - Escape them: `&gt;` or `&lt;`.
    - Or wrap in braces as a string: `{' > '}`.

## 5. TypeScript Strictness during Build
- **Problem:** `npm run build` fails on unused variables/interfaces that didn't block development.
- **Cause:** The default Vite/TS template has strict rules for production builds.
- **Solution:**
    - Ensure all declared variables/interfaces are used or removed before building.
    - Run `tsc -b` locally to verify before pushing changes.

## 7. TypeScript Configuration Casing
- **Problem:** `compilerOptions/module` error even if value seems correct (e.g., `nodenext`).
- **Cause:** Some tools or versions of TypeScript require exact casing for values like `NodeNext`.
- **Solution:** Use `NodeNext` instead of `nodenext` in `tsconfig.json`.
