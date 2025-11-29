
'use server';

// This file is being deprecated in favor of an API route handler
// to resolve issues with Turbopack and the Firebase Admin SDK.
// The logic has been moved to /api/fund-deal/route.ts.
// This action now returns an explicit error message.

export async function fundDealAction(dealId: string): Promise<{ success: boolean, message: string }> {
    console.error("fundDealAction is deprecated and should not be called directly.");
    return {
        success: false,
        message: "This server action is deprecated. The funding logic has been moved to a secure API route. The UI should be updated to call the API route instead.",
    };
}
