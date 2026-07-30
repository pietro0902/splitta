// Stop this project's `wrangler dev` and its workerd children.
//
// Windows only -- everywhere else this exits immediately, having done nothing.
//
// `npm run preview` builds and then runs `wrangler dev`, which spawns
// workerd.exe children of its own. On Windows, killing the npm parent (closing
// the terminal, Task Manager, a Ctrl-C the shell does not forward) leaves those
// children running, and they hold an open handle on `.open-next\assets`. The
// next build begins by deleting that directory, so it dies before it starts:
//
//   Error: EBUSY: resource busy or locked, rmdir '...\.open-next\assets'
//       at Module.initOutputDir (@opennextjs/aws/dist/build/helper.js)
//
// POSIX has neither half of that problem -- the signal reaches the whole
// process group, and unlinking a file someone still has open is legal there --
// which is why this is a no-op off Windows rather than a portable abstraction.
//
// Runs automatically before `build:cf` via npm's `prebuild:cf` hook; also
// available by hand as `npm run preview:stop`.
//
// It only ever kills processes started from *this* checkout's `node_modules`
// (matched on the executable path for workerd, on the command line for
// wrangler), so a dev server belonging to another project on the same machine
// is left alone. That does mean a preview genuinely running in another terminal
// gets stopped -- which is what you want: the build cannot reclaim the output
// directory while it is up.

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") process.exit(0);

const quiet = process.argv.includes("--quiet"); // say nothing when there was nothing to do
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Both spellings of our node_modules: the path as npm would write it, and the
// real one. A git worktree whose node_modules is a junction resolves to the
// latter, because Node resolves modules through to their real location.
const roots = new Set([join(ROOT, "node_modules").toLowerCase()]);
try {
  roots.add(realpathSync(join(ROOT, "node_modules")).toLowerCase());
} catch {
  // No node_modules at all -- nothing of ours can be running.
}

// Win32_Process is the only place that carries both the executable path and the
// command line, which is what distinguishes our processes from anyone else's.
// PowerShell is guaranteed present on Windows; wmic is not, being on its way out.
const survey = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$procs = Get-CimInstance Win32_Process -Filter "Name='workerd.exe' or Name='node.exe'" |
  Select-Object ProcessId, ExecutablePath, CommandLine
ConvertTo-Json -InputObject @($procs) -Compress -Depth 3
`;

const ps = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", survey],
  { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

// Never fail the build over the cleanup itself: at worst we are back to the
// EBUSY, and the message below says where to look.
if (ps.error || ps.status !== 0) {
  console.warn(`preview: could not list processes (${ps.error?.message ?? `exit ${ps.status}`});`);
  console.warn("preview: if the build fails with EBUSY on .open-next, run: Get-Process workerd | Stop-Process -Force");
  process.exit(0);
}

let listed;
try {
  listed = JSON.parse(ps.stdout.trim() || "[]");
} catch {
  console.warn("preview: could not parse the process list; skipping cleanup");
  process.exit(0);
}

// workerd runs from our node_modules, so its executable path gives it away.
// wrangler is plain node.exe, and it is the cli.js path on its command line
// that does.
function classify({ ProcessId, ExecutablePath, CommandLine }) {
  const exe = (ExecutablePath ?? "").toLowerCase();
  const cmd = (CommandLine ?? "").toLowerCase();
  const under = (text) => [...roots].some((root) => text.includes(`${root}\\`));

  if (exe.endsWith("\\workerd.exe") && under(exe)) return { pid: ProcessId, kind: "workerd" };
  if (cmd.includes("\\wrangler\\") && under(cmd)) return { pid: ProcessId, kind: "wrangler" };
  return null;
}

const targets = (Array.isArray(listed) ? listed : [listed])
  .filter((p) => p && p.ProcessId !== process.pid)
  .map(classify)
  .filter(Boolean)
  // wrangler first: it is the one that would start a replacement workerd.
  .sort((a, b) => (a.kind === "wrangler" ? 0 : 1) - (b.kind === "wrangler" ? 0 : 1));

if (targets.length === 0) {
  if (!quiet) console.log("preview: nothing running");
  process.exit(0);
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, just not ours to signal
  }
};

for (const { pid } of targets) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (err) {
    if (err.code !== "ESRCH") console.warn(`preview: could not stop pid ${pid} (${err.code})`);
  }
}

// A killed process keeps its handles until Windows has finished tearing it
// down, so waiting here is what actually makes the following build safe.
const deadline = Date.now() + 5000;
const block = new Int32Array(new SharedArrayBuffer(4));
while (targets.some((p) => alive(p.pid)) && Date.now() < deadline) {
  Atomics.wait(block, 0, 0, 50);
}

const stragglers = targets.filter((p) => alive(p.pid));
const stopped = targets.filter((p) => !alive(p.pid));

if (stopped.length > 0) {
  const summary = stopped.map((p) => `${p.kind} ${p.pid}`).join(", ");
  console.log(`preview: stopped ${summary}`);
}
if (stragglers.length > 0) {
  console.warn(`preview: still running after 5s: ${stragglers.map((p) => p.pid).join(", ")}`);
  console.warn("preview: the build may fail with EBUSY on .open-next\\assets");
}
