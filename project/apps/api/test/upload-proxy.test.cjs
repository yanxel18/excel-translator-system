const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { request } = require("node:http");
const { once } = require("node:events");
const { resolve } = require("node:path");

const mib = 1024 * 1024;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 60000 }).trim();

async function post(port, path, size, chunked = false) {
  const prefix = Buffer.from(
    '--upload-test\r\nContent-Disposition: form-data; name="file"; filename="test.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n',
  );
  const suffix = Buffer.from("\r\n--upload-test--\r\n");
  const bytes = prefix.length + size + suffix.length;
  const req = request({
    hostname: "127.0.0.1",
    port,
    path,
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=upload-test",
      ...(!chunked && {
        "Content-Length": bytes,
      }),
    },
  });
  req.setTimeout(15000, () => req.destroy(new Error("Proxy test timed out.")));
  let responded = false;
  const result = new Promise((resolve, reject) => {
    req.on("error", reject);
    req.on("response", (res) => {
      responded = true;
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode, body, bytes }),
      );
    });
  });
  const write = async (chunk) => {
    if (responded) return false;
    if (!req.write(chunk))
      await Promise.race([once(req, "drain"), result]);
    return !responded;
  };
  if (!(await write(prefix))) return result;
  const chunk = Buffer.alloc(64 * 1024, 0x61);
  for (let remaining = size; remaining > 0; remaining -= chunk.length)
    if (!(await write(chunk.subarray(0, Math.min(remaining, chunk.length)))))
      return result;
  req.end(suffix);
  return result;
}

test("web proxy accepts current multipart uploads and retains bounded ingress", {
  skip: process.env.UPLOAD_PROXY_DOCKER_TEST !== "1",
  timeout: 120000,
}, async () => {
  const suffix = randomUUID();
  const network = `upload-proxy-test-${suffix}`;
  const api = `${network}-api`;
  const web = `${network}-web`;
  const config = resolve(__dirname, "../../web/nginx.conf");
  const upstream = `
    require("node:http").createServer((req, res) => {
      let bytes = 0;
      req.on("data", chunk => bytes += chunk.length);
      req.on("end", () => {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: req.url, bytes }));
      });
    }).listen(3000, "0.0.0.0");
  `;
  let networkCreated = false;
  let apiCreated = false;
  let webCreated = false;
  try {
    docker("network", "create", network);
    networkCreated = true;
    docker("run", "-d", "--name", api, "--network", network,
      "--network-alias", "translator-api", "--memory", "256m",
      "--entrypoint", "node", "excel-translator-system-translator-api", "-e", upstream);
    apiCreated = true;
    docker("run", "-d", "--name", web, "--network", network, "--memory", "64m",
      "-p", "127.0.0.1::80", "--mount",
      `type=bind,source=${config},target=/etc/nginx/conf.d/default.conf,readonly`,
      "excel-translator-system-translator-web");
    webCreated = true;
    const port = Number(docker("port", web, "80/tcp").split(":").at(-1));
    const health = `http://127.0.0.1:${port}/`;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        ready = (await fetch(health)).ok;
      } catch (error) {
        if (!["ECONNREFUSED", "ECONNRESET"].includes(error.cause?.code))
          throw error;
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) assert.fail(docker("logs", web));
    let overhead;
    for (const chunked of [false, true]) {
      const result = await post(port, "/api/upload", 50 * mib, chunked);
      assert.equal(result.status, 201, result.body);
      assert.deepEqual(JSON.parse(result.body), {
        path: "/excel-convert/upload",
        bytes: result.bytes,
      });
      overhead = result.bytes - 50 * mib;
    }
    for (const chunked of [false, true]) {
      const exact = await post(port, "/api/upload", 51 * mib - overhead, chunked);
      assert.equal(exact.status, 201, exact.body);
      assert.equal(JSON.parse(exact.body).bytes, 51 * mib);
      const result = await post(port, "/api/upload", 51 * mib - overhead + 1, chunked);
      assert.equal(result.status, 413, result.body);
    }
    const otherRoute = await post(port, "/api/admin/application-settings", 2 * mib);
    assert.equal(otherRoute.status, 413, otherRoute.body);
  } finally {
    if (webCreated) docker("rm", "-f", web);
    if (apiCreated) docker("rm", "-f", api);
    if (networkCreated) docker("network", "rm", network);
  }
});
