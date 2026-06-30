# Agent IC — Compliance Roadmap

## Overview

Agent IC is designed to meet enterprise compliance requirements for AI vendor
governance. This document maps product features to established compliance
frameworks and identifies what is implemented vs on the roadmap.

---

## NIST AI Risk Management Framework (AI RMF 1.0)

| NIST Function | Category | Agent IC Feature | Status |
|---|---|---|---|
| GOVERN | GOVERN-1: Policies | OpenShell policy envelopes per trial | **Implemented** |
| GOVERN | GOVERN-2: Accountability | RBAC roles (buyer, approver, auditor, admin) | **Implemented** |
| GOVERN | GOVERN-3: Workforce | Mission-statement-driven intake with role-specific cases | **Implemented** |
| GOVERN | GOVERN-4: Compliant | Compliance roadmap (this document) | **In Progress** |
| GOVERN | GOVERN-5: External | Vendor claim validation against measured results | **Implemented** |
| GOVERN | GOVERN-6: Lifecycle | Renewal ledger with multi-cycle evidence tracking | **Implemented** |
| MEASURE | MEASURE-1: Appraise | 8 enterprise metrics with named formulas | **Implemented** |
| MEASURE | MEASURE-2: Track | Data hash, evidence quality scoring, accuracy metrics | **Implemented** |
| MEASURE | MEASURE-3: Harvest | NHTSA, NVD, GitHub, SEC EDGAR data sources | **Implemented** |
| MANAGE | MANAGE-1: Mitigate | OpenShell sandbox blocks unsafe actions (spend cap, network) | **Implemented** |
| MANAGE | MANAGE-2: Impact | Kill criteria with transparent rationale | **Implemented** |
| MANAGE | MANAGE-3: Respond | Kill switch: revoke spend, freeze sandbox, preserve evidence | **Roadmap** |
| MANAGE | MANAGE-4: Document | Playbook generation with governed workflow steps | **Implemented** |

---

## ISO/IEC 42001:2023 (AI Management System)

| Clause | Requirement | Agent IC Feature | Status |
|---|---|---|---|
| 5.2 | AI Policy | Governance invariants, kill criteria, policy envelopes | **Implemented** |
| 6.1 | Risk Assessment | Risk-adjusted ROI with blocked-action severity weights | **Implemented** |
| 6.2 | AI Objectives | Procurement-grade decisions: CONTINUE / REVISE / KILL | **Implemented** |
| 7.2 | Competence | Role-based access: buyer, reviewer, approver, auditor | **Implemented** |
| 7.4 | Communication | Procurement recommendation with business case narrative | **Implemented** |
| 8.1 | Operational Control | OpenShell receipts when observed; local deny-by-default policy gate, network policy, and spend caps otherwise | **Implemented with labeled runtime boundary** |
| 8.2 | AI System Assessment | Trial evidence, vendor claim validation, metrics | **Implemented** |
| 8.3 | Impact Assessment | Risk-at-scale analysis, waste assessment, opportunity cost | **Implemented** |
| 9.1 | Monitoring | Renewal ledger, longitudinal trend tracking | **Implemented** |
| 9.2 | Internal Audit | Audit trail with timestamps, hashes, receipts | **Implemented** |
| 10.1 | Nonconformity | Kill criteria trigger, evidence preservation | **Roadmap** |
| 10.2 | Corrective Action | Kill switch: automated token revocation, sandbox teardown | **Roadmap** |

---

## SOC 2 Type II Readiness

| Trust Service | Control | Agent IC Feature | Status |
|---|---|---|---|
| Security | Access Controls | RBAC with 5 roles and permission model | **Implemented** |
| Security | Network Security | OpenShell deny-by-default network policy | **Implemented** |
| Security | Intrusion Detection | OpenShell blocks unauthorized outbound (CARFAX, webhooks) | **Implemented** |
| Availability | Error Handling | Fail-closed: throws when providers unavailable | **Implemented** |
| Availability | System Monitoring | Health endpoint with service status | **Implemented** |
| Processing Integrity | Data Processing | Data hash verification, evidence quality scoring | **Implemented** |
| Processing Integrity | Change Management | Policy versioning, playbook versioning | **Partial** |
| Confidentiality | Data Classification | Public data only (NHTSA, NVD, GitHub) — no PII | **Implemented** |
| Confidentiality | Encryption | HTTPS for all API calls, credential hygiene | **Implemented** |
| Privacy | Data Retention | Policy-defined retention (roadmap: automated purge) | **Roadmap** |

---

## Implementation Priority

### Phase 1 (Current product foundation)
- Policy enforcement via OpenShell
- Evidence ledger with hashes
- RBAC model
- Health endpoint
- Fail-closed architecture

### Phase 2 (Deployment hardening)
- SOC 2 Type II audit preparation
- SSO/SAML integration
- Immutable audit log (WORM storage)
- Automated kill switch (token revocation, sandbox teardown)
- Policy versioning with rollback

### Phase 3 (Enterprise Scale)
- Multi-tenant data isolation
- Data residency controls (US/EU)
- SLA monitoring and uptime guarantees
- ERP/procurement system connectors (SAP, Workday, Coupa)
- Cross-customer vendor benchmark network
