export default {
  entry: "src/app.ts",
  source: ["src/**/*.ts"],
  exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/__fixtures__/**"],
  generatedDirectory: ".zsys/generated",
  inspector: { port: 3210 },
};
