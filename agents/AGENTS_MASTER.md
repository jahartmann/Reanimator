# 🧩 Proxmox Management System: Agent Registry

Dieses Dokument dient als zentrale Steuereinheit für das Projekt. Antigravity soll diese Registry nutzen, um Aufgaben an die spezialisierten Agents zu delegieren.

## 🏗 Projekt-Stack (Globaler Kontext)
- **Frontend:** Next.js (App Router), Tailwind CSS, Shadcn/UI
- **Backend:** Next.js Server Actions (Node.js)
- **Datenbank:** SQLite (via `better-sqlite3`, Raw SQL)
- **Zielsysteme:** Proxmox VE (Cluster & Standalone), PBS (Backup Server)

---

## 👥 Verfügbare Spezialisten
Nutze die folgende Tabelle, um den richtigen Kontext für Benutzeranfragen zu laden:

| Spezialist | Datei | Zuständigkeit |
| :--- | :--- | :--- |
| **API-Architekt** | `agents/proxmox_api_architect.md` | Proxmox REST API, SSH/Tunneling, Auth-Logik, Node.js Backend |
| **Frontend-Engineer** | `agents/ui_ux_specialist.md` | Shadcn Komponenten, Real-Time Logs, Dashboard Design |
| **Hybrid-Spezialist** | `agents/infrastructure_specialist.md` | Cross-Host Migration (Native/Streaming), Host-Backups, Disaster Recovery |
| **Data-Master** | `agents/database_architect.md` | SQLite Schema (WAL), Audit Logs, Job-Tracking (kein ORM) |

---

## 🛠 Workflow-Anweisungen für Antigravity

1. **Kontext-Check:** Bevor eine Aufgabe ausgeführt wird, prüfe, welche Spezialisten benötigt werden.
2. **Kollaboration:** Wenn eine Aufgabe sowohl UI als auch API betrifft (z.B. "Baue einen Backup-Button"), ziehe beide entsprechenden Agents hinzu.
3. **Sicherheits-Standard:** Alle Aktionen müssen den Sicherheitsregeln des `infrastructure_specialist.md` entsprechen (z.B. Validierung vor Migration).
4. **Code-Stil:** Halte dich strikt an die technischen Vorgaben (Next.js App Router, Tailwind).

---

## 🚀 Schnellstart-Befehle für den Chat
- "Analysiere das Projekt basierend auf `agents/AGENTS_MASTER.md`."
- "Delegiere die Erstellung der Migrations-Logik an den `agents/infrastructure_specialist.md`."
- "Erstelle ein Full-Stack Feature (UI + API) unter Berücksichtigung von `agents/ui_ux_specialist.md` und `agents/proxmox_api_architect.md`."
- "Verifiziere das UI Refactoring (Server Tabs, Migrations-Stepper) gegen die `agents/ui_ux_specialist.md` Guidelines."
