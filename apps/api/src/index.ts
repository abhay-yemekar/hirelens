/**
 * Package barrel for @hirelens/api. The web app's same-origin API mount
 * (apps/web/app/api/[[...route]]/route.ts) imports "./vercel" for the
 * cached app factory; tests and tools use the direct module paths.
 */
export * from "./vercel.js";
