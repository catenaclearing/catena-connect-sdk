/**
 * Two HTTPS origins for driving the built SDK in a real browser.
 *
 * `https://localhost:4601` is the partner page. It loads `dist/index.js` the
 * way a partner's bundle would and exposes `open()` and `preload()` to the
 * tests. `https://127.0.0.1:4602` stands in for the connect origin: the probe
 * page, its two endpoints, and a launch page that announces itself.
 *
 * Two hosts rather than two ports, because a port does not make a site. The
 * probe only measures anything in a cross-site frame, and `localhost` and
 * `127.0.0.1` are different sites to every browser, with no DNS involved.
 *
 * Every scenario is carried by the embed key. The SDK puts the key on the
 * probe URL as it is, so a key like `doc=4000;set=300` tells this server to
 * hold the probe document for four seconds and the `set` request for 300ms.
 * That keeps the scenarios stateless and lets them run side by side, which a
 * shared "current scenario" switch would not.
 *
 * The probe page mirrors the real one: a `SameSite=None; Secure; Partitioned`
 * cookie set and read back, inside the page's own budget, reporting the
 * verdict to its parent.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// `SDK_DIST` points at another build, to run the same scenarios against an
// earlier release and see what changed.
const dist = process.env.SDK_DIST
  ? normalize(process.env.SDK_DIST)
  : join(here, "..", "packages", "connect-sdk", "dist");

const PARTNER_PORT = 4601;
const CONNECT_PORT = 4602;
const PARTNER = `https://localhost:${PARTNER_PORT}`;
const CONNECT = `https://127.0.0.1:${CONNECT_PORT}`;

/** The real probe page's own budget for its round trip. */
const PAGE_BUDGET_MS = 1500;

/**
 * A throwaway self-signed certificate covering both hosts. `Partitioned`
 * requires `Secure`, so the connect origin has to be HTTPS, and the tests run
 * with certificate errors ignored.
 */
function certificate() {
  const dir = join(here, ".certs");
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  if (!existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "30",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      key,
      "-out",
      cert,
    ]);
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/**
 * `doc=4000;set=300` as `{ doc: "4000", set: "300" }`. Recognized keys:
 *
 * - `doc`: ms to hold the probe document. `hang` never sends it.
 * - `docOnce`: ms to hold the document on the first request for this key
 *   only, so a second launch finds a warm, fast network.
 * - `set`, `check`: ms to hold each endpoint.
 * - `cookie=refused`: `set` sends no cookie, as a browser refusing it would
 *   leave things.
 * - `silent`: the page loads and never reports.
 */
function scenario(raw) {
  const out = {};
  for (const part of (raw ?? "").split(";")) {
    const [name, value = "1"] = part.split("=");
    if (name) out[name] = value;
  }
  return out;
}

/** How many times each scenario's probe document has been asked for. */
const documentHits = new Map();

/** Hold a response for `ms`, giving up quietly if the browser goes away. */
function after(ms, req, send) {
  if (ms === "hang") return;
  const timer = setTimeout(send, Number(ms) || 0);
  req.on("close", () => clearTimeout(timer));
}

function probePage(raw, silent) {
  const query = `s=${encodeURIComponent(raw)}`;
  return `<!doctype html>
<html><body><script>
(function () {
  if (${silent ? "true" : "false"}) return;
  var settled = false;
  var post = function (supported) {
    if (settled) return;
    settled = true;
    window.parent.postMessage(
      { source: "catena-connect", version: 1, event: "probe",
        payload: { supported: supported === true } },
      "*"
    );
  };
  var controller = new AbortController();
  var options = { credentials: "include", cache: "no-store", signal: controller.signal };
  var timer = setTimeout(function () { controller.abort(); post(false); }, ${PAGE_BUDGET_MS});
  fetch("/embed/probe/set?${query}", options)
    .then(function (r) { return r.json(); })
    .then(function (m) {
      return fetch("/embed/probe/check?${query}&token=" + encodeURIComponent(m.token), options);
    })
    .then(function (r) { return r.json(); })
    .then(function (b) { post(b.arrived === true); })
    .catch(function () { post(false); })
    .then(function () { clearTimeout(timer); });
})();
</script></body></html>`;
}

/** What the flow posts when it is on screen, from a frame or a window. */
const launchPage = `<!doctype html>
<html><body><p>Catena Connect (test)</p><script>
  var target = window.opener || window.parent;
  target.postMessage({ source: "catena-connect", version: 1, event: "open" }, "*");
</script></body></html>`;

function connect(req, res) {
  const url = new URL(req.url, CONNECT);
  const send = (status, type, body, headers = {}) => {
    res.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      ...headers,
    });
    res.end(body);
  };

  if (url.pathname === "/embed/probe") {
    const raw = url.searchParams.get("embed_key") ?? "";
    const s = scenario(raw);
    const hits = (documentHits.get(raw) ?? 0) + 1;
    documentHits.set(raw, hits);
    const delay = hits === 1 && s.docOnce ? s.docOnce : (s.doc ?? 0);
    after(delay, req, () =>
      send(200, "text/html", probePage(raw, "silent" in s))
    );
    return;
  }

  if (url.pathname === "/embed/probe/set") {
    const s = scenario(url.searchParams.get("s"));
    const token = crypto.randomUUID();
    const headers =
      s.cookie === "refused"
        ? {}
        : {
            "set-cookie": `embed_probe=${token}; SameSite=None; Secure; Partitioned; Path=/embed/probe; Max-Age=10`,
          };
    after(s.set ?? 0, req, () =>
      send(200, "application/json", JSON.stringify({ token }), headers)
    );
    return;
  }

  if (url.pathname === "/embed/probe/check") {
    const s = scenario(url.searchParams.get("s"));
    const token = url.searchParams.get("token");
    const arrived = (req.headers.cookie ?? "")
      .split(";")
      .some((pair) => pair.trim() === `embed_probe=${token}`);
    after(s.check ?? 0, req, () =>
      send(200, "application/json", JSON.stringify({ arrived }))
    );
    return;
  }

  if (url.pathname.startsWith("/i/")) {
    send(200, "text/html", launchPage);
    return;
  }

  send(404, "text/plain", "not found");
}

const partnerPage = `<!doctype html>
<html><head><title>Partner (test)</title></head>
<body><h1>Partner page</h1><div id="log"></div>
<script type="module">
  import { open, preload } from "/sdk/index.js";
  window.connectOrigin = ${JSON.stringify(CONNECT)};
  window.events = [];
  window.sdk = {
    open(embedKey) {
      window.events = [];
      window.handle = open({
        inviteUrl: window.connectOrigin + "/i/test",
        embedKey,
        onOpen: () => window.events.push("open"),
        onClose: () => window.events.push("close"),
      });
    },
    destroy() {
      window.handle?.destroy();
    },
    preload(embedKey) {
      preload({ inviteUrl: window.connectOrigin + "/i/test", embedKey });
    },
  };
  window.ready = true;
</script></body></html>`;

function partner(req, res) {
  const url = new URL(req.url, PARTNER);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(partnerPage);
    return;
  }
  if (url.pathname.startsWith("/sdk/")) {
    const file = normalize(join(dist, url.pathname.slice("/sdk/".length)));
    if (!file.startsWith(dist) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(404).end();
}

if (!existsSync(join(dist, "index.js"))) {
  console.error("No SDK build found. Run `pnpm build` first.");
  process.exit(1);
}

const tls = certificate();
// Every interface, so `localhost` answers whether the browser resolves it to
// IPv4 or IPv6.
createServer(tls, partner).listen(PARTNER_PORT);
createServer(tls, connect).listen(CONNECT_PORT);
console.log(`partner ${PARTNER}, connect ${CONNECT}`);
