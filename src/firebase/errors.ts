/**
 * Represents the context of a Firestore security rule denial.
 */
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  requestResourceData?: any; // The data being written/updated
};

/**
 * A custom error class to represent Firestore permission errors with rich context.
 * This helps in debugging security rules by providing detailed information
 * about the failed request directly in the development console.
 */
export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    // Construct the detailed error message
    const message = `FirestoreError: Missing or insufficient permissions: 
The following request was denied by Firestore Security Rules:
${JSON.stringify(
  {
    auth: {
      // In a real app, you'd populate this from the current user state
      // For now, we'll leave it as a placeholder.
      uid: '(Not available in this context)',
      token: '(Not available in this context)',
    },
    method: context.operation,
    path: `/databases/(default)/documents/${context.path}`,
    request: {
      resource: {
        data: context.requestResourceData || '(No data)',
      },
    },
  },
  null,
  2
)}`;

    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is to make the error visible in the Next.js error overlay
    // by attaching the context to a property that is likely to be displayed.
    (this as any).digest = `Firestore Operation: ${context.operation} on path /${context.path}`;
  }
}
