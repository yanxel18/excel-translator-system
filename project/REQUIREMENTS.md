# Excel Translator Requirements

## Overview
Excel Translator is a secure, multi-language XLSX translation workspace. It supports uploads, selective worksheet translation, terminology control, translation history, and downloadable results while preserving source workbook structure and display formats.

## Product Experience

1. The web application uses a responsive Mantine application shell with a left navigation menu, modern header, content area, and footer.
2. The workspace provides an accessible drag-and-drop upload area and a browse-file action.
3. Lucide React is the shared icon set; icon-only controls include accessible labels.
4. The interface provides light and dark themes, English/Japanese/Chinese localization, breadcrumbs, dialogs, skeleton loading states, a top loading indicator, and motion that respects reduced-motion preferences.
5. The navigation includes Workspace, History, Vocabulary, Notifications, Changelog, and Profile pages.

## Functional Requirements

### File Upload
1. Users can upload XLSX files for translation
2. System validates file types and sizes
3. Uploaded files are stored temporarily during processing
4. ZIP expansion limits are enforced for security
5. Uploaded Unicode filenames must remain readable in job lists and downloads.
6. Before a job begins, users can select individual worksheets or select all worksheets.

### Text Extraction
1. Extract shared strings, including rich text runs, from XLSX files
2. Extract inline strings, including rich text runs, from XLSX files
3. Send extracted text to translation adapter
4. Handle malformed uploads gracefully

### Translation
1. Send bounded JSON batches to Ollama translation adapter
2. Validate returned IDs from translation service
3. Patch the OOXML with translated strings
4. Handle translation failures and retries
5. Support English, Japanese, and Chinese as source and target languages, rejecting identical source and target pairs.
6. Preserve workbook display values and number/date formats. Formula references must remain valid after translation.
7. Preserve OOXML validity so translated workbooks open without Office repair prompts.
8. Translate eligible text in worksheet cells, shared strings, inline strings, drawings, text boxes, callouts, and supported shape text.
9. Apply the selected vocabulary group before model translation using protected placeholders, then restore the approved target terms after translation. This prevents model changes to controlled terminology.

### Vocabulary Management
1. Users can create vocabulary groups scoped to a source and target language pair.
2. Each group contains unique source-term and target-term entries.
3. Users can create, edit, delete, and select groups during job setup.
4. Vocabulary groups and entries are scoped to the authenticated user unless shared by an administrator.

### Job Management
1. Manage job states (Pending, Processing, Completed, Cancelled, Failed)
2. Track job progress in real-time
3. Allow job cancellation by users
4. Provide file download functionality
5. Ensure persistent, retry-safe, and cancellable job states
6. Keep completed jobs in translation history with filename, file size, source/target language, completed date, elapsed time, and selected vocabulary group.
7. History supports filename and date filtering, preview, download, and delete actions.
8. Preview opens in a dialog through a dedicated, containerized spreadsheet-preview service based on ibis-office.

### Authentication
1. Enforce per-user ownership of jobs
2. Implement JWT-based secure user sessions
3. Handle login/logout functionality
4. Verify session validity
5. Store user identity and password hashes in PostgreSQL for local authentication.
6. Support Keycloak OIDC for frontend and backend authentication, with a configurable required group claim.

### Progress Tracking
1. Recover progress on browser reconnect
2. Ensure seamless user experience
3. Maintain state persistence across sessions
4. Emit notifications for queued, in-progress, completed, failed, and cancelled jobs. The notification page loads older notifications incrementally.

### Platform and Data
1. Use PostgreSQL through Prisma. The schema includes users, identity providers, jobs, job sheets, vocabulary groups, vocabulary entries, notifications, and changelog entries with primary keys, foreign keys, unique constraints, and query indexes.
2. Expose the application under a configurable base path, defaulting to `/excel-convert`, for Traefik deployments.
3. Provide GraphQL for application data while retaining protected REST endpoints for binary upload/download where appropriate.
4. Rename runtime services to `translator-api` and `translator-web`; update deployment references together.
5. Provide production-ready environment templates for application URLs, ports, base paths, PostgreSQL, JWT, OIDC/Keycloak, preview service, storage, and AI provider credentials/model configuration. Secret values must never be committed.
6. Provide frontend and backend test directories that mirror their source directory trees.

## Non-Functional Requirements

### Performance
1. Efficient text extraction from large XLSX files
2. Responsive UI during processing
3. Fast translation response times
4. Scalable architecture for concurrent users

### Security
1. Secure file upload handling
2. JWT-based authentication and authorization
3. Protection against malicious uploads
4. Data privacy compliance

### Reliability
1. Retry-safe job processing
2. Graceful error handling
3. Progress recovery on reconnect
4. No partial file publication

### Usability
1. Intuitive user interface
2. Clear progress indicators
3. Responsive design
4. Accessible for all users

## Technical Requirements

### Frontend
1. React 18 with TypeScript
2. Vite build tool
3. Mantine UI components
4. TanStack Query for data fetching
5. i18next for internationalization
6. Zustand for state management
7. Lucide React for icons

### Backend
1. NestJS framework
2. Prisma/PostgreSQL database
3. GraphQL/Apollo for API
4. Socket.IO for real-time updates
5. JWT authentication
6. Prisma ORM with PostgreSQL
7. Keycloak OIDC support

### Infrastructure
1. Docker Compose for local dependencies
2. Ollama translation adapter integration
3. Containerized deployment
4. ibis-office preview service

## Constraints

1. OOXML limitations must be clearly reported to users
2. No partial file publication as complete
3. ZIP expansion limits must be enforced
4. Translation service must handle bounded JSON batches
5. Source workbooks and completed translations are private to their owner.
6. The application must degrade gracefully when optional preview, OIDC, or AI services are unavailable.

## Delivery Roadmap

1. **Foundation:** Mantine application shell, base-path configuration, accessible upload flow, themes, localization foundation, icons, environment templates, and source-mirrored tests.
2. **Persistent identity:** Prisma schema, PostgreSQL migration, local user management, JWT migration, and Keycloak OIDC with group enforcement.
3. **Translation setup:** worksheet discovery/selection, source-target language selection, vocabulary CRUD, and protected-term substitution.
4. **Reliable workbook pipeline:** OOXML support expansion, formula and display-format preservation, corruption validation, and output atomicity.
5. **History and collaboration:** persistent history, filtering, download/delete, ibis-office preview dialog, live notifications, changelog, and profile pages.
6. **Deployment:** GraphQL data API, renamed services, Docker Compose, Traefik subpath verification, and production environment documentation.

## First Delivery Slice

The first delivery slice provides the new Mantine workspace shell, sidebar navigation, responsive header/footer, accessible file drop area, selected-file feedback, loading skeletons, light/dark theme control, and `/excel-convert` frontend base-path support. Existing upload and job APIs remain active during this slice.
