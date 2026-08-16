import { builtinModules } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const desktopDir = path.resolve(import.meta.dirname, "..");
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

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
          if (builtins.has(args.path)) return { path: args.path, external: true };
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
