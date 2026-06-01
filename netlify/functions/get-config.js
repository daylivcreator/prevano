exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    supabaseUrl:     process.env.PREVANO_SUPABASE_URL  || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY     || '',
  }),
});
