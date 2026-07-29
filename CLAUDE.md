# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (NestJS)
```bash
# Install dependencies (run from taskflow/ directory)
npm install

# Build the backend
npm run build  # or: npm run build (from backend/ directory)

# Start development server
npm run start:dev  # or: npm run start:dev (from backend/ directory)

# Start production server
npm run start:prod  # or: npm run start:prod (from backend/ directory)

# Run tests
npm run test                    # Jest tests
npm run test:watch              # Watch mode
npm run test:cov                # Coverage report
npm run test:e2e                # End-to-end tests

# Lint and format
npm run lint                    # ESLint with fix
npm run format                  # Prettier formatting
```

### Frontend (Next.js)
```bash
# Install dependencies (run from taskflow/ directory)
npm install

# Start development server
npm run dev  # or: npm run dev (from frontend/ directory)

# Build for production
npm run build  # or: npm run build (from frontend/ directory)

# Start production server
npm run start  # or: npm run start (from frontend/ directory)

# Lint
npm run lint  # or: npm run lint (from frontend/ directory)
```

### Monorepo (taskflow/)
```bash
# Install all dependencies
npm install

# Run lint on both projects
npm run lint  # Runs lint in both backend and frontend

# Note: Start commands must be run from respective directories
```

## High-Level Architecture

### Technology Stack
- **Backend**: NestJS (Node.js framework) with TypeScript
- **Frontend**: Next.js 16 with React 19 and TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Charting**: Recharts (for dashboard visualizations)
- **Testing**: Jest (backend), likely Jest/Round Trip Testing (frontend)

### Project Structure
```
taskflow/
├── backend/                  # NestJS backend application
│   ├── src/
│   │   ├── auth/             # Authentication module (JWT strategies, guards)
│   │   ├── users/            # User management (CRUD, roles)
│   │   ├── teams/            # Team management (CRUD, membership)
│   │   ├── projects/         # Project management (CRUD, archival)
│   │   ├── tasks/            # Task management (CRUD, status transitions)
│   │   ├── comments/         # Task commenting system
│   │   ├── notifications/    # Automated alerts and notification center
│   │   ├── reports/          # Report generation (PDF export)
│   │   ├── common/           # Shared modules (guards, decorators, DTOs)
│   │   ├── config/           # Configuration modules
│   │   ├── database/         # Database connection and models
│   │   └── health/           # Health check endpoint
│   ├── test/                 # Test files
│   ├── tsconfig.json         # TypeScript configuration
│   └── package.json          # Backend dependencies and scripts
├── frontend/                 # Next.js frontend application
│   ├── app/                  # App router (pages, layouts, components)
│   │   ├── dashboard/        # Dashboard page
│   │   ├── login/            # Login page
│   │   ├── projects/         # Project management pages
│   │   ├── tasks/            # Task management pages
│   │   └── users/            # User management pages
│   ├── components/           # Reusable React components
│   ├── contexts/             # React contexts (AuthContext)
│   ├── lib/                  # Utility functions and API clients
│   ├── styles/               # Global styles and Tailwind configuration
│   ├── tsconfig.json         # TypeScript configuration
│   └── package.json          # Frontend dependencies and scripts
├── docs/                     # Documentation (SRS, RFCs, learning notes)
│   ├── 01-Client-Request-Letter.md
│   ├── 02-project-charter.md
│   ├── 03-software-requirements-specification.md
│   └── learning-notes/
├── node_modules/             # Dependencies (hoisted by pnpm/workspaces)
├── package.json              # Workspace configuration
├── package-lock.json         # Locked dependency versions
└── opencode.json             # OpusCode configuration
```

### Key Architectural Decisions
1. **Monorepo Structure**: Uses npm workspaces to manage backend and frontend dependencies together
2. **Microservices-inspired Modularity**: Backend organized by domain modules (users, teams, projects, tasks, etc.)
3. **Role-Based Access Control (RBAC)**: Implemented via custom `@Roles()` decorator and `RolesGuard`
4. **JWT Authentication**: Stateless authentication with HTTP-only cookies for security
5. **MongoDB with Migrations**: Mongoose ODM with schema validation and timestamps
6. **Real-time Features**: Not implemented in current version (planned for future via WebSocket/SSE)
7. **Responsive Design**: Tailwind CSS ensures mobile/tablet/desktop compatibility
8. **RESTful API**: Backend provides REST endpoints consumed by Next.js frontend

## SRS Compliance Analysis

Based on examination of the codebase against the Software Requirements Specification (SRS), the system implements the majority of specified requirements:

### ✅ Implemented Functional Requirements:
- **FR-001: User Authentication** - JWT-based login/logout with session management
- **FR-002: User Management** - CRUD operations for users with role assignment
- **FR-003: Team Management** - Team creation, user assignment to teams
- **FR-004: Project Management** - Project CRUD, archival when all tasks completed
- **FR-005: Task Management** - Task creation, assignment, status transitions (To Do→In Progress→Done)
- **FR-006: Dashboard Visualizations** - Completion percentage, task distribution charts, overdue task highlighting
- **FR-007: Task Comments** - Chronological commenting system with user attribution and timestamps
- **FR-008: Automated Status Alerts** - Assignment notifications, status change alerts, 24-hour deadline warnings
- **FR-009: Document Summaries** - Project and performance report generation (PM-only access)

### ✅ Respected Out-of-Scope Items:
- No native mobile applications (web-only responsive design)
- No automated data migration from legacy systems
- No third-party platform integrations (Jira, Slack, calendars)
- No HR modules (payroll, timesheets, client billing)

### ✅ Addressed Non-Functional Requirements:
- **NFR-004 (Access Controls)**: Role guards prevent unauthorized access
- **NFR-005 (Session Management)**: JWT expiration and refresh mechanisms
- **NFR-006 (Credential Validation)**: Password strength validation (8+ chars, number, special char)
- **NFR-007 (Data Protection)**: bcrypt password hashing
- **NFR-010 (Concurrent Users)**: NestJS/Node.js scalability designed for 500+ users
- **NFR-011 (Data Volume Growth)**: MongoDB designed for 10K tasks/1K projects
- **NFR-012 (Operational Learnability)**: Standard Next.js/NestJS patterns
- **NFR-013 (Accessibility)**: Tailwind CSS with accessibility considerations
- **NFR-014 (Platform Compatibility)**: Standard web technologies (works in modern browsers)
- **NFR-015 (Interface Responsiveness)**: Tailwind responsive design breakpoints

### ✅ Implemented Business Rules:
- **BR-001 (Role Hierarchy)**: RolesGuard enforces Admin > PM > TeamMember permissions
- **BR-002 (Project Archival)**: System prevents archiving unless all tasks are Done
- **BR-003 (Task Assignment)**: Tasks only assignable to project members
- **BR-004 (Data Integrity)**: Inactive users retain historical data with status flag
- **BR-005 (Comment Audit)**: Comments maintain history (edits/deletions logged)
- **BR-006 (Deadline Validity)**: Task deadlines validated against project dates
- **BR-007 (Unique Identity)**: Email uniqueness enforced during user creation
- **BR-008 (Project Ownership)**: Exactly one Project Manager required per project
- **BR-009 (Task Ownership)**: Tasks must belong to exactly one project

## Code Quality Observations
- Consistent use of TypeScript interfaces and DTOs for data validation
- Modular architecture with clear separation of concerns
- Comprehensive use of NestJS features (guards, interceptors, pipes)
- Proper use of Mongoose decorators for schema definition
- RESTful API design with appropriate HTTP status codes
- React hooks and context for state management in frontend
- Tailwind utility-first CSS for consistent styling
- Jest testing framework with good test coverage practices

## Recommended Development Practices
1. Always run `npm run lint` before committing to maintain code style
2. Write unit tests for new services and utility functions
3. Update DTOs and schemas when modifying data structures
4. Use Angular/NestJS CLI generators for consistent code generation (`nest generate`)
5. Follow existing patterns for error handling and validation
6. Keep components small and focused in the frontend
7. Use React Query/SWR for data fetching in frontend components (if adopted)
8. Maintain consistent API response formats across backend services

This system demonstrates strong adherence to the SRS requirements with a clean, maintainable architecture that follows modern web development best practices.