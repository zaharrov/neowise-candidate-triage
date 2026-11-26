import { createServer } from "node:http";
import { handleRequest } from "./app.mjs";

const server = createServer(handleRequest);
server.listen(Number(process.env.PORT || 3000), "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${server.address().port}`);
});
