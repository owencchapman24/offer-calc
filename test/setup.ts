// Every test runs on the engine in full: its optional modules (src/offer/optional.ts) provided up front, as the scripts get them
// (src/offer/index.ts). The app's worker loads them on first use instead (app/src/engine.worker.ts).
import "../src/offer/index";
