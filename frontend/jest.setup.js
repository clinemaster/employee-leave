/* eslint-disable @typescript-eslint/no-require-imports */
import "@testing-library/jest-dom";

// jsdom's test environment has no fetch/Request/Response/Headers globals.
// RTK Query's fetchBaseQuery constructs a real `Request` internally even
// when `fetch` itself is mocked in a test, so polyfill the whole set from
// undici (the same implementation Node's own global fetch is built on).
// These conditional `require()`s intentionally stay CommonJS — this file
// runs directly under Jest's setup pipeline, not through the app's bundler.
if (typeof globalThis.TextEncoder === "undefined" || typeof globalThis.TextDecoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("node:util");
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

if (typeof globalThis.ReadableStream === "undefined") {
  const { ReadableStream, WritableStream, TransformStream } = require("node:stream/web");
  Object.assign(globalThis, { ReadableStream, WritableStream, TransformStream });
}

if (typeof globalThis.MessagePort === "undefined") {
  const { MessageChannel, MessagePort } = require("node:worker_threads");
  Object.assign(globalThis, { MessageChannel, MessagePort });
}

if (typeof globalThis.Request === "undefined") {
  const { fetch, Request, Response, Headers, FormData } = require("undici");
  Object.assign(globalThis, { fetch, Request, Response, Headers, FormData });
}
