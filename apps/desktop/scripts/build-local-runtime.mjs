import { builtinModules } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const desktopDir = path.resolve(import.meta.dirname, "..");
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function mustStayExternal(specifier) {
  if (builtins.has(specifier)) return true;
  // PGlite resolves its WASM/data assets relative to import.meta.url. Keep the
  // package external so Electron packages those assets beside its JS instead
  // of breaking that runtime URL contract inside an esbuild bundle.
  if (specifier === "@electric-sql/pglite" || specifier.startsWith("@electric-sql/pglite/")) {
    return true;
  }
  // node-postgres is CommonJS internally and uses runtime require() calls for
  // Node built-ins. Keep it as a normal Node dependency instead of translating
  // those calls into an ESM bundle where dynamic require is unavailable.
  if (specifier === "pg" || specifier.startsWith("pg/")) return true;
  // Prisma Client's runtime also performs package-native/dynamic Node requires.
  // Bundle Rakazo's generated client, but keep Prisma's own runtime package
  // external so Electron resolves it with its intended Node semantics.
  return specifier === "@prisma/client" || specifier.startsWith("@prisma/client/");
}

await build({
  entryPoints: [path.join(desktopDir, "src", "local-runtime.ts")],
  outfile: path.join(desktopDir, "dist", "local-runtime.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  conditions: ["development", "node", "import", "default"],
  logLevel: "info",
  plugins: [
    {
      name: "flowbots-workspace-runtime-boundary",
      setup(context) {
        context.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@rakazo/")) return undefined;
          if (mustStayExternal(args.path)) return { path: args.path, external: true };
          return undefined;
        });
      },
    },
  ],
});
