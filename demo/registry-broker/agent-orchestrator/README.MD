# Agent Orchestrator — Registry Demo (Sentinel Mode)

This demo showcases the registration and behavior of Agent Orchestrator within the Hashgraph Online (HOL) Registry.

Agent Orchestrator is a diagnostic observability agent designed to monitor multiple APIs and emit deterministic, non-intrusive operational signals.

---

## 🧭 Purpose of This Demo

This demo exists to demonstrate:

- How an observability agent can be registered in the HOL Registry
- How agent metadata is structured
- How the agent behaves conceptually (without executing production logic)

This demo does not run the full agent engine.

---

## 🛡️ Agent Overview

Agent Name: Agent Orchestrator  
Mode: Sentinel (Per-API Maintenance)  
Category: Observability / Diagnostics  

The agent monitors multiple services and:

- Detects failures using grace periods
- Enters per-API maintenance mode deterministically
- Emits only signal-level notifications
- Avoids remediation, mutation, or automation

---

## 🔍 What This Demo Shows

✔ Agent metadata registration  
✔ Registry discoverability  
✔ Capability declaration  
✔ Non-conversational agent model  
✔ Safe, read-only agent design  

---

## 🚫 What This Demo Does NOT Do

- ❌ No live API calls
- ❌ No monitoring logic execution
- ❌ No secrets or credentials
- ❌ No production actions

All runtime behavior lives in the main repository:
👉 https://github.com/prastiansyah/agent-orchestrator

---

## 📦 Files in This Demo

`text
agent-orchestrator-demo/
├─ README.md        # This file
├─ agent.json       # Agent metadata for HOL registry
└─ demo.ts          # Minimal registry registration example