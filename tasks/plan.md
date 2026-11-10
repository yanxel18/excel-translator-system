# Implementation Plan: Excel Translator Platform

## Overview

Complete the workbook translator as a persistent, multi-language service with secure local/OIDC authentication, vocabulary control, history, previews, notifications, GraphQL data access, and a Mantine frontend served from a configurable subpath.

## Architecture Decisions

- PostgreSQL is the system of record. Prisma owns relations, migrations, and generated access types.
- REST remains the binary upload and download boundary. GraphQL serves typed application data such as jobs, vocabulary, history, profile, and notifications.
- Vocabulary replacements use protected tokens before model translation and restore approved targets afterward. Tokens preserve terminology without exposing raw terms to the model as instructions.
- XLSX files remain in private object paths derived only from server-generated job IDs. Metadata and ownership are stored in PostgreSQL.
- ibis-office runs as an isolated preview service. The API authorizes each preview request and never exposes file-system paths to browsers.

## Dependency Graph

`platform-config` → `persistence` → `identity` → `jobs` → `vocabulary` → `history-preview` → `notifications-profile` → `frontend` → `deployment-tests`

## Risks

| Risk | Mitigation |
| --- | --- |
| OOXML shapes and diagrams are not represented like worksheet strings | Detect and report unsupported parts until their OOXML text models are implemented; validate generated archives before publishing. |
| ibis-office preview integration is version-dependent | Keep it behind a preview-service interface and deploy it as an optional Docker service. |
| OIDC setup differs by Keycloak realm | Use standard OpenID discovery and environment-configured issuer, client, callback, and required group. |
| Existing file-backed jobs need migration | Retain a local compatibility store only during migration; newly created jobs use database metadata. |

## Task List

See [todo.md](todo.md) for the ordered, testable task list.
