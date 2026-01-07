
# Application Translation Map

This document provides a high-level overview of the NAL General Marchant application structure. It serves as a "translation map" to understand the purpose and function of different parts of the codebase.

## 1. Project Root

-   **`firebase.json`**: Configures Firebase services, including pointers to Firestore rules/indexes and Cloud Functions.
-   **`firestore.rules`**: Defines the security rules for the Firestore database, controlling who can read/write data.
-   **`docs/backend.json`**: A JSON-based schema defining all data entities and their relationships in Firestore. This is a critical blueprint for the application's data model.
-   **`next.config.ts`**: Configuration file for the Next.js web application.
-   **`tailwind.config.ts`**: Configuration for the Tailwind CSS styling framework.

## 2. `/src` - Source Code

This is the main container for all application source code.

### 2.1. `/src/app` - Routing and Pages

This directory uses the Next.js App Router convention. Each folder represents a URL segment.

-   **`/src/app/` (Root)**
    -   `layout.tsx`: The root layout for the entire application, including the `<html>` and `<body>` tags.
    -   `page.tsx`: The public-facing landing page.
    -   `login/`, `signup/`, `forgot-password/`: Authentication-related pages for all users.

-   **`/src/app/(roles)` - Role-Based Dashboards**
    These folders define the main layouts and pages for each user role.
    -   **/admin/**: Contains all pages for the **Admin** dashboard (e.g., `dashboard`, `deals`, `users`, `approvals`).
    -   **/client/**: Contains all pages for the **Client** dashboard (e.g., `dashboard`, `deals/request`).
    -   **/investor/**: Contains all pages for the **Investor** dashboard (e.g., `dashboard`, `transactions`).
    -   **/legal/**: Contains pages for the **Legal** team dashboard.
    -   **/marketer/**: Contains pages for the **Marketer** dashboard.
    -   **/recovery/**: Contains pages for the **Recovery** team dashboard.

-   **`/src/app/api` - API Routes**
    -   This folder contains server-side API endpoints. Currently used for the deal funding logic (`/api/fund-deal`) to ensure robust server-side execution.

### 2.2. `/src/components` - Reusable UI

This directory holds all the reusable React components.

-   **`/src/components/ui`**: Contains the base UI components from the `shadcn/ui` library (e.g., `Button.tsx`, `Card.tsx`, `Input.tsx`). These are the building blocks of the UI.
-   **`admin-nav.tsx`**: The specific navigation component for the admin sidebar.
-   `page-header.tsx`: A standardized header component used at the top of most pages.
-   `update-profile-form.tsx` & `change-password-form.tsx`: Reusable forms for user settings.
-   `onboarding-tour.tsx`: Manages the guided tour for new users in each role.

### 2.3. `/src/lib` - Core Logic and Utilities

This contains shared utilities, type definitions, and helper functions.

-   **`types.ts`**: Defines the core TypeScript types for data entities like `Deal`, `User`, and `Investment`.
-   **`amortization.ts`**: Contains the complex financial logic for generating repayment schedules.
-   **`utils.ts`**: General utility functions, most notably `cn` for merging Tailwind CSS classes.

### 2.4. `/src/firebase` - Firebase Configuration

This directory centralizes all Firebase-related setup and hooks.

-   **`admin-app.ts`**: **Server-side only**. Initializes the Firebase Admin SDK for use in Server Actions and API routes.
-   **`client-provider.tsx` & `provider.tsx`**: **Client-side only**. Sets up and provides the Firebase client SDK context to the React application.
-   **`auth/use-user.tsx`**: A custom React hook that provides the currently authenticated user's data and auth state throughout the app.
-   **`firestore/use-collection.tsx` & `use-doc.tsx`**: Custom hooks for listening to real-time data from Firestore collections and documents.

### 2.5. `/src/ai` - Genkit AI Flows

This directory contains the logic for AI-powered features.

-   **`genkit.ts`**: Initializes and configures the Genkit AI instance.
-   **`/flows/analyze-financing-proposal.ts`**: A server-side flow that uses a GenAI model to analyze text-based deal proposals.

---

This map should provide a clear starting point for understanding where different pieces of functionality live. We can now proceed with making changes with this shared blueprint in mind.
