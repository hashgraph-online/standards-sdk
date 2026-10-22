/* ============================================================
 * Agent Orchestrator — Registry Demo
 * Purpose: Demonstrate agent metadata for HOL Registry
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

function loadAgentMetadata() {
  const filePath = path.resolve(__dirname, "agent.json");

  if (!fs.existsSync(filePath)) {
    throw new Error("agent.json not found");
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function runAgentOrchestratorDemo() {
  const agent = loadAgentMetadata();

  console.log("============================================================");
  console.log("🛡️  AGENT REGISTRY DEMO");
  console.log("============================================================");
  console.log("Name        :", agent.name);
  console.log("Version     :", agent.version);
  console.log("Description :", agent.description || "N/A");
  console.log("------------------------------------------------------------");

  console.log("Capabilities:");
  (agent.capabilities || []).forEach((cap) => {
    console.log(" •", cap);
  });

  console.log("------------------------------------------------------------");

  console.log("Interfaces:");
  (agent.interfaces || []).forEach((iface) => {
    console.log(" •", iface);
  });

  console.log("------------------------------------------------------------");

  if (agent.non_goals && agent.non_goals.length > 0) {
    console.log("Explicit Non-Goals:");
    agent.non_goals.forEach((ng) => {
      console.log(" •", ng);
    });
  } else {
    console.log("Explicit Non-Goals: None declared");
  }

  console.log("============================================================");
  console.log("✔ Agent metadata loaded successfully");
  console.log("✔ Ready for HOL Registry submission");
  console.log("============================================================");
}

runAgentOrchestratorDemo();
