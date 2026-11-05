import { defineApp } from "convex/server";
import weflayr from "../../src/component/convex.config.js";

const app = defineApp();
app.use(weflayr);

export default app;
