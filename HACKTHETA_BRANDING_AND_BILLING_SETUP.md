# HackTheta branding and billing setup (current: PayU India)

This document previously described the retired Razorpay implementation. It is kept at this path so older bookmarks do not break, but its Razorpay instructions are obsolete.

**For the current billing integration, follow [`PAYU_SETUP.md`](./PAYU_SETUP.md).** The current source uses PayU India Hosted Checkout + Standing Instructions (SI), keeps the ₹30/month Premium plan, preserves the existing one-time 7-day trial flow, and stores verified PayU attempts alongside retained historical billing records.

The PayU migration is additive for Supabase. Do not drop the legacy Razorpay columns or payment rows: they are retained solely so prior billing history is not lost. The old Razorpay Checkout browser integration and Razorpay webhook endpoint are not part of the current active payment flow.

For the combined release including AI Pitch Arena, also read [`AI_PITCH_ARENA_INTEGRATION.md`](./AI_PITCH_ARENA_INTEGRATION.md).
