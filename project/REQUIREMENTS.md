# Excel Translator Requirements

## Overview
The Excel Translator application is designed to translate Japanese XLSX files into English. It should handle file uploads, extract text from spreadsheets, translate the text using an Ollama translation adapter, and manage job states and progress.

## Functional Requirements

### File Upload
1. Users can upload XLSX files for translation
2. System validates file types and sizes
3. Uploaded files are stored temporarily during processing
4. ZIP expansion limits are enforced for security

### Text Extraction
1. Extract plain shared strings from XLSX files
2. Extract inline strings from XLSX files
3. Send extracted text to translation adapter
4. Handle malformed uploads gracefully

### Translation
1. Send bounded JSON batches to Ollama translation adapter
2. Validate returned IDs from translation service
3. Patch the OOXML with translated strings
4. Handle translation failures and retries

### Job Management
1. Manage job states (Pending, Processing, Completed, Cancelled, Failed)
2. Track job progress in real-time
3. Allow job cancellation by users
4. Provide file download functionality
5. Ensure persistent, retry-safe, and cancellable job states

### Authentication
1. Enforce per-user ownership of jobs
2. Implement JWT-based secure user sessions
3. Handle login/logout functionality
4. Verify session validity

### Progress Tracking
1. Recover progress on browser reconnect
2. Ensure seamless user experience
3. Maintain state persistence across sessions

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

### Backend
1. NestJS framework
2. Prisma/PostgreSQL database
3. GraphQL/Apollo for API
4. Socket.IO for real-time updates
5. JWT authentication

### Infrastructure
1. Docker Compose for local dependencies
2. Ollama translation adapter integration
3. Containerized deployment

## Constraints

1. OOXML limitations must be clearly reported to users
2. No partial file publication as complete
3. ZIP expansion limits must be enforced
4. Translation service must handle bounded JSON batches