// One shared database, many businesses: every deployment of this backend
// serves exactly one business, chosen by env. Every query must scope with it.
export const BUSINESS_ID = Number(process.env.BUSINESS_ID || 1);
