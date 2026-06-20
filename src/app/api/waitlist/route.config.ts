// OS-1394: force dynamic rendering for the GET handler. Previously the initial
// deploy had no GET handler and Vercel edge cached a 404. Using route.config.ts
// (the recommended Next.js App Router approach) ensures the config is parsed
// correctly and doesn't interfere with the route handler exports.
export const dynamic = 'force-dynamic';
