import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const desktopDir = path.resolve(import.meta.dirname, "..");
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const packageJson = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8"));
const declaredDependencies = new Set(Object.keys(packageJson.dependencies ?? {}));

const result = await build({
  entryPoints: [path.join(desktopDir, "src", "local-runtime.ts")],
  outfile: path.join(desktopDir, "dist", "local-runtime.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  metafile: true,
  conditions: ["development", "node", "import", "default"],
  logLevel: "info",
  plugins: [
    {
      name: "flowbots-workspace-runtime-boundary",
      setup(context) {
        context.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@rakazo/")) return undefined;
          if (builtins.has(args.path)) return { path: args.path, external: true };
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

function packageRoot(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

const undeclared = new Set();
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (!imported.external || builtins.has(imported.path)) continue;
    const root = packageRoot(imported.path);
    if (root.startsWith("@rakazo/")) {
      throw new Error(`LocalRuntime workspace package escaped the bundle: ${imported.path}`);
    }
    if (!declaredDependencies.has(root)) undeclared.add(root);
  }
}

if (undeclared.size > 0) {
  throw new Error(
    `LocalRuntime emitted undeclared desktop runtime dependencies: ${[...undeclared].sort().join(", ")}`,
  );
}
