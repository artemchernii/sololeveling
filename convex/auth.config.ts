/* Tells Convex which JWTs to trust. CLERK_JWT_ISSUER_DOMAIN is the Issuer URL
   from the Clerk JWT template named "convex", set on the Convex deployment
   (`npx convex env set CLERK_JWT_ISSUER_DOMAIN https://…`), not in .env.local.
   applicationID must match the template's name. */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: 'convex',
    },
  ],
}
