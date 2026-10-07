// Vercel: exit 0 skips a build; exit 1 continues it.
// Preview deployments remain disabled until a separate test backend and owned
// callback origins have been configured and reviewed. This is not the CI gate.
const skip = process.env.VERCEL_ENV === 'preview';
console.log(skip ? 'Preview disabled pending backend isolation.' : 'Continue build; production promotion requires Deployment Checks.');
process.exit(skip ? 0 : 1);
