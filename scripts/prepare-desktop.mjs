import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const rootDirectory = process.cwd();
const standaloneDirectory = join(rootDirectory, ".next", "standalone");
const standalonePackagePath = join(standaloneDirectory, "package.json");

function ensureExists(pathname, description) {
  if (!existsSync(pathname)) {
    throw new Error(`Missing ${description}: ${pathname}`);
  }
}

function replaceDirectory(fromPath, toPath) {
  if (!existsSync(fromPath)) {
    return;
  }

  rmSync(toPath, { force: true, recursive: true });
  mkdirSync(dirname(toPath), { recursive: true });
  cpSync(fromPath, toPath, { recursive: true });
}

ensureExists(standaloneDirectory, "standalone output");
ensureExists(standalonePackagePath, "standalone package.json");
ensureExists(join(rootDirectory, "desktop", "main.cjs"), "desktop main process entrypoint");
ensureExists(join(rootDirectory, ".next", "static"), "Next static assets");

replaceDirectory(join(rootDirectory, ".next", "static"), join(standaloneDirectory, ".next", "static"));
replaceDirectory(join(rootDirectory, "public"), join(standaloneDirectory, "public"));
replaceDirectory(join(rootDirectory, "desktop"), join(standaloneDirectory, "desktop"));

const rootPackage = JSON.parse(readFileSync(join(rootDirectory, "package.json"), "utf8"));
const standalonePackage = JSON.parse(readFileSync(standalonePackagePath, "utf8"));

const preparedStandalonePackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  private: true,
  main: "desktop/main.cjs",
  dependencies: standalonePackage.dependencies ?? rootPackage.dependencies
};

writeFileSync(
  standalonePackagePath,
  `${JSON.stringify(preparedStandalonePackage, null, 2)}\n`,
  "utf8"
);

console.log(`Prepared desktop bundle in ${standaloneDirectory}`);
