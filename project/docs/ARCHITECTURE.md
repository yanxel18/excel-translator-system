# Excel Translator Architecture

## Overview

This document outlines the architecture of the Japanese-to-English XLSX translation application. The application is built using a modern stack including React 18, Vite, TypeScript, Mantine, TanStack Query, i18next, Zustand for the frontend, and NestJS, Prisma/PostgreSQL, GraphQL/Apollo, Socket.IO, JWT for the backend. Docker Compose is used for local dependencies. The application will handle file uploads, extract text, translate it using an Ollama translation adapter, and manage job states and progress.

## Module Structure

### Frontend Modules

1. **FileUploadModule**
   - Handles file uploads and validation.
   - Provides user interface for uploading XLSX files.

2. **TextExtractionModule**
   - Extracts shared strings and inline strings, including rich text runs, from XLSX files.
   - Sends extracted text to the translation adapter.

3. **TranslationModule**
   - Sends bounded JSON batches to the Ollama translation adapter.
   - Validates returned IDs and patches the OOXML with translated strings.

4. **JobManagementModule**
   - Manages job states, progress, cancellation, and download.
   - Provides a job list and ensures persistent, retry-safe, and cancellable job states.

5. **AuthenticationModule**
   - Enforces per-user ownership and authentication.
   - Uses JWT for secure user sessions.

6. **ProgressTrackingModule**
   - Recovers progress on browser reconnect.
   - Ensures seamless user experience.

### Backend Modules

1. **FileUploadService**
   - Handles file uploads and validation.
   - Stores original uploads and enforces ZIP expansion limits.

2. **TextExtractionService**
   - Extracts shared strings and inline strings, including rich text runs, from XLSX files.
   - Sends extracted text to the translation adapter.

3. **TranslationService**
   - Sends bounded JSON batches to the Ollama translation adapter.
   - Validates returned IDs and patches the OOXML with translated strings.

4. **JobManagementService**
   - Manages job states, progress, cancellation, and download.
   - Provides a job list and ensures persistent, retry-safe, and cancellable job states.

5. **AuthenticationService**
   - Enforces per-user ownership and authentication.
   - Uses JWT for secure user sessions.

6. **ProgressTrackingService**
   - Recovers progress on browser reconnect.
   - Ensures seamless user experience.

## Interfaces

### Frontend-Backend Interfaces

1. **FileUploadInterface**
   - Methods: `uploadFile`, `validateFile`
   - Description: Handles file uploads and validation.

2. **TextExtractionInterface**
   - Methods: `extractText`
   - Description: Extracts shared strings and inline strings, including rich text runs, from XLSX files.

3. **TranslationInterface**
   - Methods: `sendTextForTranslation`, `validateTranslation`, `patchOOXML`
   - Description: Sends text for translation, validates returned IDs, and patches the OOXML.

4. **JobManagementInterface**
   - Methods: `getJobList`, `getJobProgress`, `cancelJob`, `downloadFile`
   - Description: Manages job states, progress, cancellation, and download.

5. **AuthenticationInterface**
   - Methods: `login`, `logout`, `verifySession`
   - Description: Handles user authentication and session management.

6. **ProgressTrackingInterface**
   - Methods: `recoverProgress`
   - Description: Recovers progress on browser reconnect.

## Job States

1. **Pending**
   - Description: Job is waiting to be processed.

2. **Processing**
   - Description: Job is currently being processed.

3. **Completed**
   - Description: Job has been successfully completed.

4. **Cancelled**
   - Description: Job has been cancelled by the user.

5. **Failed**
   - Description: Job has failed due to an error.

## OOXML Limitations

1. **Rich Text Formatting**
   - Description: Translated rich-text content is placed in the first non-empty run because formatting cannot be mapped reliably to translated word boundaries.

2. **Unsupported Comments**
   - Description: The application detects unsupported comments and clearly reports limitations.

3. **Unsupported Drawings**
   - Description: The application detects unsupported drawings and clearly reports limitations.

4. **Unsupported Other Text Parts**
   - Description: The application detects unsupported other text parts and clearly reports limitations.

5. **Malformed Uploads**
   - Description: The application detects malformed uploads and enforces ZIP expansion limits.

6. **Partial File Publication**
   - Description: The application never publishes a partial file as complete.

## Conclusion

This architecture document provides a clear structure for the Japanese-to-English XLSX translation application. It outlines the module structure, interfaces, job states, and OOXML limitations to ensure a robust and reliable application.
