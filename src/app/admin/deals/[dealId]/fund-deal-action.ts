
'use server';

// This file is being deprecated in favor of an API route handler
// to resolve issues with Turbopack and the Firebase Admin SDK.
// The logic has been moved to /api/fund-deal/route.ts.

export async function fundDealAction(dealId: string): Promise<{ success: boolean, message: string }> {
    return {
        success: false,
        message: "This server action is deprecated. Please use the API route.",
    };
}
