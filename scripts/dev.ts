const cwd = Deno.cwd();

const server = new Deno.Command(Deno.execPath(), {
  args: ["task", "dev:server"],
  cwd,
  env: { ...Deno.env.toObject(), RADIO_WEB_DEV_URL: "http://localhost:5173" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const web = new Deno.Command(Deno.execPath(), {
  args: ["task", "dev:web"],
  cwd,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const signal = () => {
  try {
    server.kill("SIGTERM");
  } catch {
    void 0;
  }
  try {
    web.kill("SIGTERM");
  } catch {
    void 0;
  }
};

addEventListener("unload", signal);

await Promise.race([server.status, web.status]);
signal();

