import { execSync, exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import os from "os";

// Equivalent of __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buyer_config = "https://github.com/ONDC-Official/buyer-mock-config.git";
const seller_config = "https://github.com/ONDC-Official/seller-mock-config.git";
const protocol_config =
  "https://github.com/ONDC-Official/protocol-server-config.git";
const sanbox_ui = "https://github.com/mofahsan/sandbox-ui.git";
const buyer_engine = "https://github.com/ONDC-Official/buyer-mock-engine.git";
const seller_engine = "https://github.com/ONDC-Official/seller-mock-engine.git";
const protocol_engine =
  "https://github.com/ONDC-Official/protocol-server-engine.git";

const buyer_mock_env = `PORT = 8000 
CONFIG_URL = "https://raw.githubusercontent.com/ONDC-Official/buyer-mock-config/FIS-PRMAAN-dev/build/build.json" 
PROTOCOL_SERVER_BASE_URL = "http://localhost:80/"  `;

const protocol_server_env = `config_url= https://raw.githubusercontent.com/ONDC-Official/protocol-server-config/Mobility/build/build.json
PORT = 80
BUSINESS_SERVER_IS_SYNC = false
IS_VERIFY_AUTH = false
SERVER_TYPE = BAP
SUBSCRIBER_URL = https://325e-103-173-93-158.ngrok-free.app 
BACKEND_SERVER_URL= http://localhost:8000
GATEWAY_URL = "https://staging.gateway.proteantech.in/"
PRIVATE_KEY=Un205TSOdDXTq8E+N/sJOLJ8xalnzZ1EUP1Wcv23sKx70fOfFd4Q2bzfpzPQ+6XZhZv65SH7Pr6YMk8SuFHpxQ==
SUBSCRIBER_ID=mobility-staging.ondc.org
SUBSCRIBER_UNIQUE_KEY=UK-MOBILITY
is_loadConfigFromGit = true
DATABASE_CONNECTION_STRING = mongodb://localhost:27017/protocolServerBAP
USE_DB = false
VERSION = 1.0.0`;

const repos = [
  buyer_config,
  seller_config,
  protocol_config,
  sanbox_ui,
  buyer_engine,
  seller_engine,
  protocol_engine,
];

const targetPath = path.resolve(__dirname, "repos");

// Function to prompt user for input
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}
async function cloneGitRepos() {
  try {
    if (fs.existsSync(targetPath)) {
      console.log("Deleting existing 'repos' directory...");
      return;
    }
    fs.mkdirSync(targetPath, { recursive: true });

    for (const repo of repos) {
      try {
        // Clone the repository
        execSync(`git clone ${repo}`, { cwd: targetPath, stdio: "inherit" });
        console.log(`Successfully cloned ${repo}`);

        // Ask for the branch name
        const branchName = await askQuestion(
          "Enter branch name to switch to: "
        );

        if (branchName) {
          const repoName = repo.split("/").pop().replace(".git", ""); // Extract repo name from URL
          const repoPath = path.join(targetPath, repoName);

          // Switch to the specified branch
          execSync(`git checkout ${branchName}`, {
            cwd: repoPath,
            stdio: "inherit",
          });
          console.log(
            `Successfully switched to branch ${branchName} in ${repoName}`
          );
        }
      } catch (error) {
        console.error(
          `Failed to clone or switch branch for ${repo}: ${error.message}`
        );
      }
    }
  } catch (error) {
    console.error(`Failed to create 'repos' directory: ${error.message}`);
  }
}
async function createEnvFiles() {
  try {
    fs.writeFileSync(
      path.join(targetPath, "buyer-mock-engine/.env"),
      buyer_mock_env
    );
    fs.writeFileSync(
      path.join(targetPath, "protocol-server-engine/buyer.mob.env"),
      protocol_server_env
    );
    console.log("Successfully created .env files");
  } catch (error) {
    console.error(`Failed to create .env files: ${error.message}`);
  }
}
async function installDependencies() {
  try {
    for (const repo of repos) {
      const repoName = repo.split("/").pop().replace(".git", "");
      const repoPath = path.join(targetPath, repoName);
      execSync("npm install", { cwd: repoPath, stdio: "inherit" });
      console.log(`Successfully installed dependencies for ${repoName}`);
    }
  } catch (error) {
    console.error(`Failed to install dependencies: ${error.message}`);
  }
}

let processes = [];
function openTerminal(command, cwd) {
  const platform = os.platform();
  let terminalCommand;

  switch (platform) {
    case "darwin": // macOS
      terminalCommand = `osascript -e 'tell application "Terminal" to do script "cd ${cwd} && ${command}"'`;
      break;
    case "win32": // Windows
      terminalCommand = `start cmd /k "cd ${cwd} && ${command}"`;
      break;
    case "linux": // Linux
      terminalCommand = `gnome-terminal -- bash -c "cd ${cwd} && ${command}; exec bash"`;
      break;
    default:
      throw new Error("Unsupported platform: " + platform);
  }

  const proc = spawn(terminalCommand, [], {
    cwd,
    shell: true,
    detached: true, // Detach to create a new process group
    stdio: "ignore", // Ignore stdio so it doesn't tie to the parent process
  });

  proc.unref(); // Allow the parent process to exit without waiting for the child process

  processes.push({ name: command, proc, pgid: proc.pid });
}

async function startBuyer() {
  try {
    const commands = [
      {
        name: "buyer-mock-engine",
        cmd: "npm run dev",
        args: ["run", "dev"],
        path: `${targetPath}/buyer-mock-engine`,
      },
      {
        name: "protocol-server-engine",
        cmd: "npm run dev:buyer",
        args: ["run", "dev:buyer"],
        path: `${targetPath}/protocol-server-engine`,
      },
      {
        name: "sandbox-ui",
        cmd: "npm run start",
        args: ["run", "start"],
        path: `${targetPath}/sandbox-ui`,
      },
    ];
    commands.forEach(({ name, cmd, path }) => {
      console.log(`Starting ${name}...`);
      openTerminal(cmd, path);
    });
  } catch (error) {
    console.error(`Failed to start Buyer: ${error.message}`);
  }
}
function stopBuyer() {
  console.log(processes, "processes");
  processes.forEach(({ proc, name, pgid }) => {
    try {
      if (os.platform() === "win32") {
        // On Windows, use taskkill to terminate the terminal window and process
        exec(`taskkill /PID ${pgid} /T /F`, (error, stdout, stderr) => {
          if (error) {
            console.error(
              `Error terminating process ${pgid}: ${error.message}`
            );
            return;
          }
          console.log(`Process ${pgid} terminated`);
        });
      } else {
        // On macOS/Linux, kill the process group
        process.kill(pgid);
        console.log(`Process ${pgid} terminated`);
      }
    } catch (error) {
      console.error(`Error terminating process ${pgid}: ${error.message}`);
    }
  });
  console.log("Stopped all processes");
  console.log(processes);
  // processes = []; // Clear the array after killing all processes
}

function refreshAll() {
  stopBuyer();
  startBuyer();
}

async function Init() {
  await cloneGitRepos();
  await createEnvFiles();
  await installDependencies();
}
async function main() {
  let choice = -1;
  while (choice !== 0) {
    console.log("Choose an option:");
    console.log("1. Initialize repositories");
    console.log("2. Start servers");
    console.log("3. Refresh servers");
    console.log("4. Stop servers");
    console.log("0. Exit");

    choice = parseInt(await askQuestion("Enter your choice: "));

    switch (choice) {
      case 1:
        await Init();
        break;
      case 2:
        await startBuyer();
        break;
      case 3:
        refreshAll();
        break;
      case 4:
        await stopBuyer();
        break;
      case 0:
        await stopBuyer();
        console.log("Exiting...");
        break;
      default:
        console.log("Invalid choice. Please try again.");
        break;
    }
  }
}
// cloneGitRepos();
await main();
