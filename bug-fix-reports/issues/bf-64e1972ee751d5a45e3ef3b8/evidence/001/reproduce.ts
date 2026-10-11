const response = await fetch("http://127.0.0.1:3000/_relkit/v1/openapi.json");
const document = await response.json();
const paths = Object.keys(document.paths);
console.log(JSON.stringify({ status: response.status, paths, loginDocumented: paths.includes("/api/auth/sign-in/email") }));
if (!paths.includes("/api/auth/sign-in/email")) throw new Error("Better Auth login is missing from Scalar's document");
