// Retired route. Netlify interprets the -background filename suffix as an async job.
// Keep this no-op during migration so cached older pages cannot spend PhotoRoom credits.
// The synchronous replacement is photoroom-cutout.ts at /api/admin/photoroom-cutout.
export default async () => new Response(JSON.stringify({
  error:'This route has been retired. Reload Admin to use the updated PhotoRoom cutout service.'
}),{status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const config = {path:'/api/admin/remove-background'};
