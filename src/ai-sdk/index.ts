import { createOpenAI } from "@ai-sdk/openai";
import type { Weflayr } from "../client/index.js";

/** A Vercel AI SDK model that sends its request through the Weflayr gateway. Pass `weflayr.headers(meta)` as the request headers. */
export function weflayrModel(weflayr: Weflayr, modelId: string) {
  const { baseURL, apiKey } = weflayr.connection();
  return createOpenAI({ baseURL, apiKey, name: "weflayr" }).chat(modelId);
}
